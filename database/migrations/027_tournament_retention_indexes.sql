CREATE INDEX tournament_move_previews_created_idx ON tournament_move_previews(created_at);
CREATE INDEX tournaments_finished_idx ON tournaments(finished_at) WHERE finished_at IS NOT NULL;
