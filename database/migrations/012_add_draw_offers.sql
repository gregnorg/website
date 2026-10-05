ALTER TABLE games
  ADD COLUMN draw_offered_by_id TEXT REFERENCES "user"(id),
  ADD COLUMN draw_offer_id UUID,
  ADD CONSTRAINT games_draw_offer_pair CHECK ((draw_offered_by_id IS NULL) = (draw_offer_id IS NULL));
