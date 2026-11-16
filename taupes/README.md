# Les Taupes

Un jeu de réflexion à flux continu : des taupes sortent d'un terrier, marchent
droit devant elles sans réfléchir, et il faut leur ouvrir un chemin jusqu'à la
sortie en leur distribuant des métiers.

Une seule page, aucune dépendance, aucun asset externe : le terrain est dessiné
au code, les taupes aussi.

## Le cœur du jeu : un terrain destructible au pixel

Le terrain est une image de 480 × 200. À côté d'elle vit un `Uint8Array` de la
même taille, le **masque**, qui dit pour chaque pixel s'il est plein.

Creuser, c'est effacer dans les deux en même temps — `destination-out` sur
l'image, zéros dans le masque. Bâtir, c'est l'inverse. Toute la physique se
réduit ensuite à lire le masque : `solide(x, y)`.

La convention de position compte : **`y` est la rangée de sol sous les pieds**.
Une taupe est posée quand `solide(x, y)` est vrai, et elle tombe tant qu'il est
faux. Marcher, c'est chercher la première rangée pleine entre `y - 6` et
`y + 4` à la colonne suivante : au-dessus c'est une pente qu'on gravit, en
dessous une marche qu'on descend, rien du tout et c'est la chute. Si le plein
commence à `y - 6` et continue plus haut, c'est une paroi : demi-tour, ou
escalade si la taupe est grimpeuse.

## Les huit métiers

| Métier | Ce qu'il fait |
| --- | --- |
| Grimpeuse | Escalade les parois au lieu de faire demi-tour |
| Parachutiste | Survit à n'importe quelle chute |
| Bombe | Explose au bout de cinq secondes et ouvre un trou |
| Bloqueuse | S'immobilise et renvoie les autres |
| Bâtisseuse | Pose douze marches en montant |
| Perceuse | Traverse à l'horizontale |
| Mineuse | Creuse en biais vers le bas |
| Creuseuse | Descend tout droit |

Grimpeuse et parachutiste sont permanents et se cumulent ; les autres
remplacent le métier en cours.

## Ajouter un niveau

Une entrée dans `NIVEAUX` suffit :

```js
{
  nom: 'Titre du niveau',
  entree: { x, y },            // la chute depuis le terrier doit rester sous 64 px
  sortie: { x, y },
  nombre, aSauver, secondes, cadence,
  stock: { batisseuse: 6, ... },
  terrain: [ { x, y, l, h }, ... ],   // sol(x, l, y) raccourcit un sol plein
  dangers: [ { x, y, l, h } ]         // eau : contact mortel
}
```

Deux pièges de calibrage : une chute de plus de **64 pixels** tue, et une
bâtisseuse ne couvre que **24 pixels en largeur pour 12 en hauteur** — au-delà,
il faut enchaîner plusieurs bâtisseuses.

## Essais

`window.__taupes` expose la simulation pour les tests automatisés : `etat()`,
`pas(n)` pour avancer d'un nombre de pas donné, `pause()`, `choisir()`,
`appliquerA(i)`, `solide(x, y)`, `charger(i)`. C'est ainsi que le premier niveau
est vérifié gagnable sans toucher à la souris.
