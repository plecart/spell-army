-- Valeurs de départ des réglages du calibrage, sources : docs/game-design.md § 6 et l'issue #11.
INSERT INTO "calibration_settings" (
	"id",
	"recruit_share",
	"recruit_share_drop",
	"reference_window_days",
	"average_recruit_life",
	"average_recruit_strength",
	"average_recruit_magic",
	"average_recruit_speed",
	"day_two_budget_recruits"
) VALUES (1, 0.7, 0.1, 3, 7.6, 7.6, 7.5, 7.3, 10);
