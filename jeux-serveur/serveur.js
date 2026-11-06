/*
 * Serveur de jeu en ligne — salons, parties 1 contre 1, reprise après coupure.
 *
 * Aucune dépendance : le protocole WebSocket (RFC 6455) est implémenté ici même,
 * pour que le déploiement reste un copier-coller de fichier et un PM2, comme
 * health-server.js, sans npm install sur le VPS.
 *
 *   JEUX_PORT    port d'écoute (3860 par défaut)
 *   JEUX_RACINE  dossier servi en statique (le dépôt par défaut)
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.JEUX_PORT || 3860);
const RACINE = path.resolve(process.env.JEUX_RACINE || path.join(__dirname, '..'));

/* Dossiers servis en statique. Tout le reste du dépôt reste invisible. */
const DOSSIERS_PUBLICS = ['salon', 'solitaire', 'puissance4', 'morpion'];

const MAX_MESSAGE = 64 * 1024;
const SALON_INACTIF_MS = 2 * 60 * 60 * 1000;   /* deux heures sans un mot : le salon s'efface */
const PING_MS = 25 * 1000;

/* ====================================================================== */
/* WebSocket                                                              */
/* ====================================================================== */

const GUID = '258EAFA5-E914-47DA-95CA-5AB0DC85B11D';

function clefDAcceptation(clef) {
  return crypto.createHash('sha1').update(clef + GUID).digest('base64');
}

class Connexion {
  constructor(socket) {
    this.socket = socket;
    this.tampon = Buffer.alloc(0);
    this.fragments = [];
    this.opFragment = 0;
    this.ouverte = true;
    this.vivante = true;
    this.onMessage = null;
    this.onFermeture = null;

    socket.setNoDelay(true);
    socket.on('data', (bloc) => this.recevoir(bloc));
    socket.on('error', () => this.terminer());
    socket.on('close', () => this.terminer());
  }

  recevoir(bloc) {
    if (!this.ouverte) return;
    this.tampon = Buffer.concat([this.tampon, bloc]);
    for (;;) {
      const trame = this.lireTrame();
      if (!trame) break;
      this.traiter(trame);
      if (!this.ouverte) break;
    }
  }

  /* Renvoie la trame complète suivante, ou null s'il manque des octets. */
  lireTrame() {
    const b = this.tampon;
    if (b.length < 2) return null;

    const fin = (b[0] & 0x80) !== 0;
    const op = b[0] & 0x0f;
    const masquee = (b[1] & 0x80) !== 0;
    let taille = b[1] & 0x7f;
    let i = 2;

    /* Le client doit masquer ses trames : sinon la connexion est invalide. */
    if (!masquee) { this.fermer(1002); return null; }

    if (taille === 126) {
      if (b.length < i + 2) return null;
      taille = b.readUInt16BE(i); i += 2;
    } else if (taille === 127) {
      if (b.length < i + 8) return null;
      const grand = b.readBigUInt64BE(i);
      if (grand > BigInt(MAX_MESSAGE)) { this.fermer(1009); return null; }
      taille = Number(grand); i += 8;
    }
    if (taille > MAX_MESSAGE) { this.fermer(1009); return null; }

    if (b.length < i + 4) return null;
    const clef = b.subarray(i, i + 4); i += 4;

    if (b.length < i + taille) return null;
    const charge = Buffer.from(b.subarray(i, i + taille));
    for (let k = 0; k < charge.length; k++) charge[k] ^= clef[k & 3];

    this.tampon = b.subarray(i + taille);
    return { fin, op, charge };
  }

  traiter(trame) {
    if (trame.op === 0x8) { this.fermer(1000); return; }
    if (trame.op === 0x9) { this.ecrire(0xa, trame.charge); return; }
    if (trame.op === 0xa) { this.vivante = true; return; }
    if (trame.op !== 0x0 && trame.op !== 0x1 && trame.op !== 0x2) { this.fermer(1002); return; }

    if (trame.op !== 0x0) { this.opFragment = trame.op; this.fragments = []; }
    this.fragments.push(trame.charge);

    let total = 0;
    for (const f of this.fragments) total += f.length;
    if (total > MAX_MESSAGE) { this.fermer(1009); return; }
    if (!trame.fin) return;

    const entier = Buffer.concat(this.fragments);
    this.fragments = [];
    if (this.opFragment === 0x1 && this.onMessage) this.onMessage(entier.toString('utf8'));
  }

  ecrire(op, charge) {
    if (!this.ouverte) return;
    const n = charge.length;
    let entete;
    if (n < 126) {
      entete = Buffer.alloc(2);
      entete[1] = n;
    } else if (n < 65536) {
      entete = Buffer.alloc(4);
      entete[1] = 126;
      entete.writeUInt16BE(n, 2);
    } else {
      entete = Buffer.alloc(10);
      entete[1] = 127;
      entete.writeBigUInt64BE(BigInt(n), 2);
    }
    entete[0] = 0x80 | op;
    try { this.socket.write(Buffer.concat([entete, charge])); } catch (e) { this.terminer(); }
  }

  envoyer(objet) {
    this.ecrire(0x1, Buffer.from(JSON.stringify(objet), 'utf8'));
  }

  sonder() {
    this.vivante = false;
    this.ecrire(0x9, Buffer.alloc(0));
  }

  fermer(code) {
    if (!this.ouverte) return;
    const charge = Buffer.alloc(2);
    charge.writeUInt16BE(code || 1000, 0);
    this.ecrire(0x8, charge);
    this.ouverte = false;
    try { this.socket.end(); } catch (e) {}
    if (this.onFermeture) { const f = this.onFermeture; this.onFermeture = null; f(); }
  }

  terminer() {
    if (!this.ouverte) return;
    this.ouverte = false;
    try { this.socket.destroy(); } catch (e) {}
    if (this.onFermeture) { const f = this.onFermeture; this.onFermeture = null; f(); }
  }
}

/* ====================================================================== */
/* Règles des jeux — le serveur arbitre, le client n'est jamais cru        */
/* ====================================================================== */

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/* Alignement passant par (r, c) ; renvoie les cases gagnantes ou null. */
function alignement(cases, largeur, hauteur, r, c, longueur) {
  const joueur = cases[r * largeur + c];
  if (!joueur) return null;
  for (const [dr, dc] of DIRECTIONS) {
    const ligne = [r * largeur + c];
    for (let k = 1; k < longueur; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (rr < 0 || rr >= hauteur || cc < 0 || cc >= largeur) break;
      if (cases[rr * largeur + cc] !== joueur) break;
      ligne.push(rr * largeur + cc);
    }
    for (let k = 1; k < longueur; k++) {
      const rr = r - dr * k, cc = c - dc * k;
      if (rr < 0 || rr >= hauteur || cc < 0 || cc >= largeur) break;
      if (cases[rr * largeur + cc] !== joueur) break;
      ligne.unshift(rr * largeur + cc);
    }
    if (ligne.length >= longueur) return ligne;
  }
  return null;
}

const MORPION_GRILLES = { '3': { n: 3, align: 3 }, '11': { n: 11, align: 5 } };
const P4_GRILLES = {
  '7x6': { l: 7, h: 6 }, '6x5': { l: 6, h: 5 }, '8x7': { l: 8, h: 7 }
};

const JEUX = {
  morpion: {
    nom: 'Morpion',
    joueurs: 2,

    normaliser(options) {
      const grille = MORPION_GRILLES[String(options && options.grille)] ? String(options.grille) : '3';
      return { grille: grille };
    },

    creer(options, ouvreur) {
      const g = MORPION_GRILLES[options.grille];
      return {
        largeur: g.n, hauteur: g.n, align: g.align,
        cases: new Array(g.n * g.n).fill(0),
        trait: ouvreur, coups: [], fini: 0, ligne: []
      };
    },

    /* coup = index de case */
    jouer(etat, joueur, coup) {
      if (etat.fini) return 'La manche est terminée.';
      if (etat.trait !== joueur) return "Ce n'est pas votre tour.";
      const i = Number(coup);
      if (!Number.isInteger(i) || i < 0 || i >= etat.cases.length) return 'Case inconnue.';
      if (etat.cases[i]) return 'Cette case est déjà prise.';

      etat.cases[i] = joueur;
      etat.coups.push(i);

      const ligne = alignement(etat.cases, etat.largeur, etat.hauteur,
        Math.floor(i / etat.largeur), i % etat.largeur, etat.align);
      if (ligne) { etat.fini = joueur; etat.ligne = ligne; return null; }
      if (etat.coups.length === etat.cases.length) { etat.fini = 3; return null; }
      etat.trait = 3 - joueur;
      return null;
    }
  },

  puissance4: {
    nom: 'Puissance 4',
    joueurs: 2,

    normaliser(options) {
      const grille = P4_GRILLES[String(options && options.grille)] ? String(options.grille) : '7x6';
      return { grille: grille };
    },

    creer(options, ouvreur) {
      const g = P4_GRILLES[options.grille];
      return {
        largeur: g.l, hauteur: g.h, align: 4,
        cases: new Array(g.l * g.h).fill(0),
        hauteurs: new Array(g.l).fill(0),
        trait: ouvreur, coups: [], fini: 0, ligne: []
      };
    },

    /* coup = numéro de colonne */
    jouer(etat, joueur, coup) {
      if (etat.fini) return 'La manche est terminée.';
      if (etat.trait !== joueur) return "Ce n'est pas votre tour.";
      const c = Number(coup);
      if (!Number.isInteger(c) || c < 0 || c >= etat.largeur) return 'Colonne inconnue.';
      if (etat.hauteurs[c] >= etat.hauteur) return 'Cette colonne est pleine.';

      const r = etat.hauteur - 1 - etat.hauteurs[c];
      etat.cases[r * etat.largeur + c] = joueur;
      etat.hauteurs[c]++;
      etat.coups.push(c);

      const ligne = alignement(etat.cases, etat.largeur, etat.hauteur, r, c, 4);
      if (ligne) { etat.fini = joueur; etat.ligne = ligne; return null; }
      if (etat.coups.length === etat.cases.length) { etat.fini = 3; return null; }
      etat.trait = 3 - joueur;
      return null;
    }
  }
};

/* ====================================================================== */
/* Salons                                                                 */
/* ====================================================================== */

/* Alphabet sans caractères qu'on confond à l'oral ou à l'écrit : ni I, ni O, ni 0, ni 1. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const salons = new Map();

function codeNeuf() {
  for (let essai = 0; essai < 200; essai++) {
    let code = '';
    const octets = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) code += ALPHABET[octets[i] % ALPHABET.length];
    if (!salons.has(code)) return code;
  }
  return null;
}

function jetonNeuf() { return crypto.randomBytes(16).toString('hex'); }

function nomPropre(nom, defaut) {
  const net = String(nom == null ? '' : nom).replace(/\s+/g, ' ').trim().slice(0, 24);
  return net || defaut;
}

function creerSalon(jeu, options) {
  const code = codeNeuf();
  if (!code) return null;
  const regles = JEUX[jeu];
  const opts = regles.normaliser(options);
  const salon = {
    code: code,
    jeu: jeu,
    options: opts,
    joueurs: [],
    ouvreur: 1,
    score: { 1: 0, 2: 0, nulles: 0 },
    etat: regles.creer(opts, 1),
    manche: 1,
    touche: Date.now()
  };
  salons.set(code, salon);
  return salon;
}

function joueurDe(salon, place) {
  return salon.joueurs.find((j) => j.place === place) || null;
}

function vueSalon(salon, pour) {
  const regles = JEUX[salon.jeu];
  return {
    type: 'etat',
    code: salon.code,
    jeu: salon.jeu,
    nomJeu: regles.nom,
    options: salon.options,
    manche: salon.manche,
    score: salon.score,
    vous: pour,
    joueurs: [1, 2].map((p) => {
      const j = joueurDe(salon, p);
      return { place: p, nom: j ? j.nom : null, present: !!(j && j.conn && j.conn.ouverte) };
    }),
    partie: {
      largeur: salon.etat.largeur,
      hauteur: salon.etat.hauteur,
      align: salon.etat.align,
      cases: salon.etat.cases,
      trait: salon.etat.trait,
      fini: salon.etat.fini,
      ligne: salon.etat.ligne,
      coups: salon.etat.coups.length
    }
  };
}

function diffuser(salon) {
  salon.touche = Date.now();
  for (const j of salon.joueurs) {
    if (j.conn && j.conn.ouverte) j.conn.envoyer(vueSalon(salon, j.place));
  }
}

function manchesuivante(salon) {
  const regles = JEUX[salon.jeu];
  salon.etat = regles.creer(salon.options, salon.ouvreur);
  salon.manche++;
}

function enregistrerFin(salon) {
  const fini = salon.etat.fini;
  if (!fini) return;
  if (fini === 3) { salon.score.nulles++; salon.ouvreur = 3 - salon.ouvreur; }
  else { salon.score[fini]++; salon.ouvreur = 3 - fini; }
}

/* ====================================================================== */
/* Sessions                                                               */
/* ====================================================================== */

function attacher(conn) {
  let moi = null;   /* { salon, place, jeton } une fois dans un salon */

  const erreur = (message) => conn.envoyer({ type: 'erreur', message: message });

  const quitterPlace = () => {
    if (!moi) return;
    const j = joueurDe(moi.salon, moi.place);
    if (j && j.conn === conn) j.conn = null;
    diffuser(moi.salon);
  };

  conn.onFermeture = quitterPlace;

  conn.onMessage = (texte) => {
    let msg;
    try { msg = JSON.parse(texte); } catch (e) { return erreur('Message illisible.'); }
    if (!msg || typeof msg.type !== 'string') return erreur('Message incomplet.');

    if (msg.type === 'creer') {
      if (moi) return erreur('Vous êtes déjà dans un salon.');
      if (!JEUX[msg.jeu]) return erreur('Jeu inconnu.');
      const salon = creerSalon(msg.jeu, msg.options);
      if (!salon) return erreur('Impossible de créer un salon pour le moment.');
      const jeton = jetonNeuf();
      salon.joueurs.push({ place: 1, nom: nomPropre(msg.nom, 'Joueur 1'), jeton: jeton, conn: conn });
      moi = { salon: salon, place: 1, jeton: jeton };
      conn.envoyer({ type: 'salon', code: salon.code, place: 1, jeton: jeton, jeu: salon.jeu, options: salon.options });
      diffuser(salon);
      return;
    }

    if (msg.type === 'rejoindre') {
      if (moi) return erreur('Vous êtes déjà dans un salon.');
      const code = String(msg.code || '').toUpperCase().trim();
      const salon = salons.get(code);
      if (!salon) return erreur('Aucun salon ne porte ce code.');
      if (salon.joueurs.length >= JEUX[salon.jeu].joueurs) return erreur('Ce salon est complet.');
      const jeton = jetonNeuf();
      const place = joueurDe(salon, 1) ? 2 : 1;
      salon.joueurs.push({ place: place, nom: nomPropre(msg.nom, 'Joueur ' + place), jeton: jeton, conn: conn });
      moi = { salon: salon, place: place, jeton: jeton };
      conn.envoyer({ type: 'salon', code: salon.code, place: place, jeton: jeton, jeu: salon.jeu, options: salon.options });
      diffuser(salon);
      return;
    }

    if (msg.type === 'reprendre') {
      if (moi) return erreur('Vous êtes déjà dans un salon.');
      const code = String(msg.code || '').toUpperCase().trim();
      const salon = salons.get(code);
      if (!salon) return erreur('Ce salon n’existe plus.');
      const j = salon.joueurs.find((x) => x.jeton === msg.jeton);
      if (!j) return erreur('Place introuvable dans ce salon.');
      if (j.conn && j.conn.ouverte && j.conn !== conn) j.conn.fermer(1000);
      j.conn = conn;
      moi = { salon: salon, place: j.place, jeton: j.jeton };
      conn.envoyer({ type: 'salon', code: salon.code, place: j.place, jeton: j.jeton, jeu: salon.jeu, options: salon.options });
      diffuser(salon);
      return;
    }

    if (!moi) return erreur("Rejoignez d'abord un salon.");
    const salon = moi.salon;

    if (msg.type === 'coup') {
      if (salon.joueurs.length < JEUX[salon.jeu].joueurs) return erreur("L'adversaire n'est pas encore là.");
      const refus = JEUX[salon.jeu].jouer(salon.etat, moi.place, msg.coup);
      if (refus) return erreur(refus);
      enregistrerFin(salon);
      diffuser(salon);
      return;
    }

    if (msg.type === 'nouvelle') {
      if (!salon.etat.fini) return erreur('La manche est encore en cours.');
      manchesuivante(salon);
      diffuser(salon);
      return;
    }

    if (msg.type === 'quitter') {
      quitterPlace();
      const s = moi.salon;
      const j = joueurDe(s, moi.place);
      if (j) s.joueurs = s.joueurs.filter((x) => x !== j);
      moi = null;
      conn.onFermeture = null;
      conn.envoyer({ type: 'parti' });
      diffuser(s);
      if (!s.joueurs.length) salons.delete(s.code);
      return;
    }

    if (msg.type === 'ping') { conn.envoyer({ type: 'pong' }); return; }

    erreur('Type de message inconnu : ' + msg.type);
  };
}

/* ====================================================================== */
/* HTTP statique                                                          */
/* ====================================================================== */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

function servirFichier(req, res) {
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
  catch (e) { res.writeHead(400).end('Requête illisible'); return; }

  if (chemin === '/') { res.writeHead(302, { Location: '/salon/' }).end(); return; }

  if (chemin === '/sante') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'] });
    res.end(JSON.stringify({
      statut: 'ok',
      salons: salons.size,
      joueurs: [...salons.values()].reduce((n, s) => n + s.joueurs.length, 0),
      depuis: Math.round(process.uptime())
    }));
    return;
  }

  if (chemin.endsWith('/')) chemin += 'index.html';

  const racineDossier = chemin.split('/')[1];
  if (!DOSSIERS_PUBLICS.includes(racineDossier)) { res.writeHead(404).end('Introuvable'); return; }

  const cible = path.resolve(path.join(RACINE, chemin));
  /* Barrière anti-traversée : la cible doit rester sous la racine. */
  if (cible !== RACINE && !cible.startsWith(RACINE + path.sep)) { res.writeHead(403).end('Interdit'); return; }

  fs.readFile(cible, (err, contenu) => {
    if (err) { res.writeHead(404).end('Introuvable'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(cible).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(contenu);
  });
}

/* ====================================================================== */
/* Démarrage                                                              */
/* ====================================================================== */

const serveur = http.createServer(servirFichier);
const connexions = new Set();

serveur.on('upgrade', (req, socket, premier) => {
  const chemin = (req.url || '').split('?')[0];
  const clef = req.headers['sec-websocket-key'];
  if (chemin !== '/ws' || req.headers.upgrade !== 'websocket' || !clef) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + clefDAcceptation(clef) + '\r\n\r\n'
  );

  const conn = new Connexion(socket);
  connexions.add(conn);
  const oter = () => connexions.delete(conn);
  const precedente = conn.onFermeture;
  attacher(conn);
  const apres = conn.onFermeture;
  conn.onFermeture = () => { oter(); if (apres) apres(); };
  void precedente;

  if (premier && premier.length) conn.recevoir(premier);
});

/* Sondes de vie : une connexion muette est coupée au tour suivant. */
setInterval(() => {
  for (const conn of connexions) {
    if (!conn.ouverte) { connexions.delete(conn); continue; }
    if (!conn.vivante) { conn.terminer(); connexions.delete(conn); continue; }
    conn.sonder();
  }
}, PING_MS).unref();

/* Ménage des salons oubliés. */
setInterval(() => {
  const limite = Date.now() - SALON_INACTIF_MS;
  for (const [code, salon] of salons) {
    const quelquUn = salon.joueurs.some((j) => j.conn && j.conn.ouverte);
    if (!quelquUn && salon.touche < limite) salons.delete(code);
  }
}, 5 * 60 * 1000).unref();

serveur.listen(PORT, () => {
  console.log('Serveur de jeu à l\'écoute sur le port ' + PORT);
  console.log('Dossier servi : ' + RACINE);
});

module.exports = { serveur, salons, JEUX };
