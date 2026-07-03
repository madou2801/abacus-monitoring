-- 0019_stage_service_fait.sql
-- Aligne le libellé de l'étape finale sur la terminologie Wedof : « Service fait »
-- (Wedof affiche « service fait » quand la formation est terminée — états
-- serviceDone / serviceDoneValidated). Le code interne reste 'certifie' : aucune
-- migration de données ni de mapping, seul l'affichage/le sens du label changent.
-- « Certifié » était trompeur (laisse croire à un résultat d'examen obtenu).

update crm.pipeline_stages
   set label = 'Service fait',
       description = 'Formation terminée — « service fait » (Wedof serviceDone/serviceDoneValidated). '
                    || 'N''implique pas le résultat d''examen/certification.'
 where code = 'certifie';

update crm.control_points
   set criterion = 'Service fait (formation terminée, Wedof)'
 where code = 'cp_completion';
