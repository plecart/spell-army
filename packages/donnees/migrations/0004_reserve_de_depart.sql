-- Réserve de départ des sorts, sources : docs/game-design.md, « Annexe B — Réserve de départ (24 sorts) »,
-- et l'issue #12. Transcrite de STARTING_POOL (packages/combat), sous les mêmes numéros ; `key` est la clé
-- d'unicité de chaque sort (spellKey). Un test d'apps/web compare chaque ligne à STARTING_POOL.
INSERT INTO "spells" ("number", "name", "recipe", "form", "effect", "key", "weight", "description") VALUES
	(
		1,
		'Coup d''épée',
		'{"kind":"shares","shares":{"strength":100}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'strength:100|safe|damage|armyStat',
		1,
		'Dégâts selon la Force.'
	),
	(
		2,
		'Lancer de rocher',
		'{"kind":"shares","shares":{"strength":60,"life":40}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'life:40+strength:60|safe|damage|armyStat',
		1,
		'Dégâts selon 60 % de la Force et 40 % de la Vie.'
	),
	(
		3,
		'Charge',
		'{"kind":"shares","shares":{"strength":50,"speed":50}}',
		'{"kind":"costly","armyLossShare":0.1}',
		'{"base":"armyStat","damage":{"constant":1.15,"perGauge":0}}',
		'speed:50+strength:50|costly|damage|armyStat',
		1,
		'Gros dégâts selon 50 % de la Force et 50 % de la Vitesse. L''armée perd 10 % des dégâts infligés.'
	),
	(
		4,
		'Coup de marteau',
		'{"kind":"shares","shares":{"strength":100}}',
		'{"kind":"conditional","gauge":"monsterLifeLost"}',
		'{"base":"armyStat","damage":{"constant":1.4,"perGauge":-1}}',
		'strength:100|conditional:monsterLifeLost|damage|armyStat',
		1,
		'Dégâts selon la Force, d''autant plus forts que le monstre est intact.'
	),
	(
		5,
		'Coup vampirique',
		'{"kind":"shares","shares":{"strength":100}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":0.5,"perGauge":0},"heal":{"constant":0.5,"perGauge":0}}',
		'strength:100|safe|lifesteal|armyStat',
		1,
		'Vol de vie selon la Force : moitié en dégâts, moitié en soin de l''armée.'
	),
	(
		6,
		'Boule de feu',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'magic:100|safe|damage|armyStat',
		1,
		'Dégâts selon la Magie.'
	),
	(
		7,
		'Météore',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"costly","armyLossShare":0.15}',
		'{"base":"armyStat","damage":{"constant":1.2,"perGauge":0}}',
		'magic:100|costly|damage|armyStat',
		1,
		'Gros dégâts selon la Magie. L''armée perd 15 % des dégâts infligés.'
	),
	(
		8,
		'Éclair',
		'{"kind":"shares","shares":{"magic":70,"speed":30}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'magic:70+speed:30|safe|damage|armyStat',
		1,
		'Dégâts selon 70 % de la Magie et 30 % de la Vitesse.'
	),
	(
		9,
		'Drain de vie',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":0.5,"perGauge":0},"heal":{"constant":0.5,"perGauge":0}}',
		'magic:100|safe|lifesteal|armyStat',
		1,
		'Vol de vie selon la Magie : moitié en dégâts, moitié en soin de l''armée.'
	),
	(
		10,
		'Tornade',
		'{"kind":"shares","shares":{"speed":100}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'speed:100|safe|damage|armyStat',
		1,
		'Dégâts selon la Vitesse.'
	),
	(
		11,
		'Soin',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","heal":{"constant":1.2,"perGauge":0}}',
		'magic:100|safe|heal|armyStat',
		1,
		'Soin de l''armée selon la Magie.'
	),
	(
		12,
		'Prière',
		'{"kind":"shares","shares":{"strength":20,"magic":80}}',
		'{"kind":"safe"}',
		'{"base":"armyStat","heal":{"constant":0.6,"perGauge":0},"damage":{"constant":0.4,"perGauge":0}}',
		'magic:80+strength:20|safe|lifesteal|armyStat',
		1,
		'Vol de vie selon 20 % de la Force et 80 % de la Magie : un peu plus de soin de l''armée que de dégâts.'
	),
	(
		13,
		'Soin des blessés graves',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"conditional","gauge":"armyWounds"}',
		'{"base":"armyStat","heal":{"constant":0.6,"perGauge":1}}',
		'magic:100|conditional:armyWounds|heal|armyStat',
		1,
		'Soin de l''armée selon la Magie, d''autant plus fort que l''armée est blessée.'
	),
	(
		14,
		'Cri de ralliement',
		'{"kind":"shares","shares":{"life":100}}',
		'{"kind":"safe"}',
		'{"base":"armyMaxLife","heal":{"constant":0.2,"perGauge":0}}',
		'life:100|safe|heal|armyMaxLife',
		1,
		'Soin de 20 % de la Vie maximale de l''armée, selon la Vie.'
	),
	(
		15,
		'Rage du désespoir',
		'{"kind":"shares","shares":{"strength":100}}',
		'{"kind":"conditional","gauge":"armyWounds"}',
		'{"base":"armyStat","damage":{"constant":0.5,"perGauge":1}}',
		'strength:100|conditional:armyWounds|damage|armyStat',
		1,
		'Dégâts selon la Force, d''autant plus forts que l''armée est blessée.'
	),
	(
		16,
		'Le Barbare ignorant',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"inverted"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'magic:100|inverted|damage|armyStat',
		1,
		'Dégâts selon la Magie, d''autant plus forts que le lanceur en manque.'
	),
	(
		17,
		'Les golems se relèvent',
		'{"kind":"shares","shares":{"life":100}}',
		'{"kind":"conditional","gauge":"classShare","characterClass":"golem"}',
		'{"base":"armyStat","heal":{"constant":0.6,"perGauge":4}}',
		'life:100|conditional:classShare:golem|heal|armyStat',
		1,
		'Soin de l''armée selon la Vie, d''autant plus fort que l''armée compte de golems.'
	),
	(
		18,
		'Appel du clan',
		'{"kind":"bestStat"}',
		'{"kind":"conditional","gauge":"casterClassShare"}',
		'{"base":"armyStat","damage":{"constant":0.4,"perGauge":3.5}}',
		'bestStat|conditional:casterClassShare|damage|armyStat',
		1,
		'Dégâts selon la meilleure stat du lanceur, d''autant plus forts que l''armée compte de membres de sa classe.'
	),
	(
		19,
		'Talent caché',
		'{"kind":"bestStat"}',
		'{"kind":"safe"}',
		'{"base":"armyStat","damage":{"constant":0.85,"perGauge":0}}',
		'bestStat|safe|damage|armyStat',
		1,
		'Dégâts selon la meilleure stat du lanceur.'
	),
	(
		20,
		'Vengeance',
		'{"kind":"shares","shares":{"life":100}}',
		'{"kind":"safe"}',
		'{"base":"monsterLastHit","damage":{"constant":1.4,"perGauge":0}}',
		'life:100|safe|damage|monsterLastHit',
		1,
		'Dégâts de 140 % du dernier coup du monstre, selon la Vie.'
	),
	(
		21,
		'Le Poids plume',
		'{"kind":"shares","shares":{"strength":100}}',
		'{"kind":"inverted"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'strength:100|inverted|damage|armyStat',
		1,
		'Dégâts selon la Force, d''autant plus forts que le lanceur en manque.'
	),
	(
		22,
		'Le Rebouteux',
		'{"kind":"shares","shares":{"magic":100}}',
		'{"kind":"inverted"}',
		'{"base":"armyStat","heal":{"constant":1.2,"perGauge":0}}',
		'magic:100|inverted|heal|armyStat',
		1,
		'Soin de l''armée selon la Magie, d''autant plus fort que le lanceur en manque.'
	),
	(
		23,
		'Le Coup lent',
		'{"kind":"shares","shares":{"speed":100}}',
		'{"kind":"inverted"}',
		'{"base":"armyStat","damage":{"constant":1,"perGauge":0}}',
		'speed:100|inverted|damage|armyStat',
		1,
		'Dégâts selon la Vitesse, d''autant plus forts que le lanceur en manque.'
	),
	(
		24,
		'Le Sacrifice',
		'{"kind":"shares","shares":{"life":100}}',
		'{"kind":"inverted"}',
		'{"base":"armyStat","heal":{"constant":1.1,"perGauge":0}}',
		'life:100|inverted|heal|armyStat',
		1,
		'Soin de l''armée selon la Vie, d''autant plus fort que le lanceur en manque.'
	);
