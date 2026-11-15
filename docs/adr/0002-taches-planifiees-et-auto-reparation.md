# ADR 0002 — Tâches planifiées et auto-réparation : un tic horaire rejouable

- **Statut** : accepté le 2026-11-15
- **Source** : `docs/etudes/00-cadrage.md` § 2 « Joueurs » (Robustesse), § 2 « Architecture »
  (Planification, File d'attente) ; étude `04-architecture.md` § 3 quater

## Exigence

> Quoi qu'il arrive, ça doit fonctionner, même partiellement, et se réparer seul. Un retard est
> acceptable, une réparation manuelle ne l'est pas. — cadrage, Décidé

Toute la conception ci-dessous découle de cette phrase : un tic manqué, doublé ou interrompu se
rattrape au tic suivant, sans intervention.

## Contraintes vérifiées (Vercel Schedules, en bêta)

- Sur Hobby, une tâche s'exécute **au plus toutes les 15 minutes**, avec une marge de déclenchement
  (jitter) toujours égale à 15 minutes.
- **5 000 exécutions par mois pour tout le compte**, exécutions manuelles comprises. Au-delà, toutes
  les exécutions planifiées sont **sautées jusqu'au mois suivant**.
- Une exécution en échec n'est **pas relancée** (cible fonction ou route). Une même exécution peut
  arriver **deux fois**, et deux exécutions peuvent **se chevaucher**.
- Une exécution en retard est livrée tant qu'elle n'a pas expiré, puis sautée.
- Les tâches d'un déploiement de production sont actives d'office.

## Décisions

| Sujet | Décision | Origine |
|---|---|---|
| Planificateur | Vercel Schedules, cible : une route de `apps/web` protégée par `CRON_SECRET`. | Accepté le 2026-11-15 |
| Une seule tâche | Un **tic horaire** par environnement, à l'heure pile, fuseau `Europe/Paris`. Il lit l'état en base et fait ce qui est dû, dans cet ordre : (1) le combat du jour s'il n'a pas eu lieu ; (2) la suite d'une passe complète interrompue ; (3) la passe rapide (ADR 0003). | Accepté le 2026-11-15 |
| Rejouable | Chaque étape est idempotente. Un tic doublé ne fait rien de plus ; un tic manqué est rattrapé par le suivant. Le combat de minuit part au premier tic après minuit, entre 00 h 00 et 00 h 15 à cause du jitter. Il ne prend que les joueurs vus avant minuit (cadrage, « Conception de l'import », point 6). | Accepté le 2026-11-15 |
| Verrou à bail | Un verrou en base, avec une date d'expiration fixée au-delà de la durée maximale d'une fonction (300 s sur Hobby). Un tic qui plante ne bloque donc jamais les suivants : le verrou expire seul. | Accepté le 2026-11-15 |
| Budget | Deux environnements × 720 tics ≈ 1 440 exécutions par mois, sur 5 000. Une cadence plus serrée que 30 minutes est interdite sur Hobby : à 15 minutes, on atteindrait 5 760 et tout s'arrêterait jusqu'au mois suivant. | Accepté le 2026-11-15 |
| Filet | Un cron GitHub Actions, toutes les 6 heures, appelle la même route dans chaque environnement. Il n'ajoute rien si le tic tourne, grâce au verrou et à l'idempotence ; il prend le relais si Schedules est bloqué ou en panne. Environ 240 minutes Actions par mois. | Accepté le 2026-11-15 |
| Surveillance | Chaque tic réussi envoie un signal à healthchecks.io. Une absence prolongée de signal alerte le mainteneur ; l'alerte informe, la réparation reste automatique. | Accepté le 2026-11-15 |

## Ce qui reste hors de portée du code

**Pause du plan Hobby en cas de dépassement de quota** (pic de trafic, par exemple). La page Hobby
dit qu'il faut attendre 30 jours ; selon la base de connaissances Vercel, un projet mis en pause « ne
reprend jamais automatiquement » et se relance à la main. C'est la seule panne qui demande une
intervention. Elle est couverte par la ligne du cadrage « gratuit tant qu'on n'est pas bloqué, puis
Pro ». Pour l'éloigner : pages servies en cache par le CDN, règle de débit et Attack Mode
(ADR 0004). Sur Hobby, aucune alerte de dépense n'existe : Spend Management n'est proposé qu'en Pro.

## Conséquences

- Schedules est en bêta : ses limites peuvent changer. Le filet GitHub Actions et l'idempotence
  évitent que tout repose sur lui.
- Si le combat devenait trop long pour 300 s, il deviendrait lui aussi reprenable par curseur, comme
  l'import. C'est à mesurer à 50 000 personnages.

## Vérifié

- [Schedules Limits](https://vercel.com/docs/schedules/limits) et
  [Schedules Concepts](https://vercel.com/docs/schedules/concepts) : lues le 2026-11-11 ; les pages
  annoncent la bêta et des limites qui peuvent changer.
- [Hobby plan](https://vercel.com/docs/plans/hobby) (mise à jour le 2026-09-14) : attente de 30 jours
  après dépassement, Spend Management « N/A » sur Hobby, fonctions limitées à 300 s.
- [Why has my account or deployment been paused?](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked)
  (mise à jour le 2026-10-02) : reprise jamais automatique.
- La correction qui suit a été relevée le 2026-11-15. La limite « une fois par jour sur Hobby » est
  celle de l'ancien système de cron Vercel ; elle ne s'applique pas à Schedules.
