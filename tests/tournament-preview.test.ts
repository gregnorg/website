import assert from "node:assert/strict";
import test from "node:test";
import { applyMove, emptyBoard, type MovePayload, type TurnAction } from "../lib/pushfight.ts";
import { previewBoard } from "../lib/tournament-preview.ts";

const white: MovePayload={type:"setup",pieces:[
  {row:0,col:2,kind:"pusher"},{row:0,col:3,kind:"pusher"},{row:1,col:0,kind:"pusher"},
  {row:1,col:1,kind:"nonpusher"},{row:1,col:2,kind:"nonpusher"},
]};
const black: MovePayload={type:"setup",pieces:[
  {row:0,col:4,kind:"pusher"},{row:0,col:5,kind:"pusher"},{row:0,col:6,kind:"pusher"},
  {row:1,col:4,kind:"nonpusher"},{row:1,col:5,kind:"nonpusher"},
]};

test("partial setup previews validate zones, order, and collisions",()=>{
  const base=emptyBoard();
  const preview=previewBoard(base,{type:"setup",pieces:[{row:0,col:2,kind:"pusher"}]},true,"white");
  assert.equal(preview[0][2],"white-pusher");
  assert.equal(base[0][2],"empty");
  assert.deepEqual(previewBoard(base,{type:"setup",pieces:[]},true,"white"),base);
  for(const pieces of [
    [{row:0,col:4,kind:"pusher"}], [{row:0,col:0,kind:"pusher"}],
    [{row:0,col:2,kind:"nonpusher"}], [{row:0,col:2,kind:"pusher"},{row:0,col:2,kind:"pusher"}],
  ])assert.throws(()=>previewBoard(base,{type:"setup",pieces},true,"white"));
});
test("piece moves and pushes are previewed independently without submitting a turn",()=>{
  const base=applyMove(applyMove(emptyBoard(),white,"white").board,black,"black").board;
  const move={type:"move",from:{row:1,col:0},to:{row:2,col:0}};
  const first=previewBoard(base,{type:"turn",actions:[move]},false,"white");
  assert.equal(first[2][0],"white-pusher");assert.equal(base[2][0],"empty");
  const push={type:"push",index:{row:0,col:3},dir:"right"};
  const second=previewBoard(base,{type:"turn",actions:[move,push]},false,"white");
  assert.equal(second[0][4],"white-pusher-anchor");
  assert.deepEqual(previewBoard(base,{type:"turn",actions:[]},false,"white"),base);
  assert.throws(()=>previewBoard(base,{type:"turn",actions:[push,move]},false,"white"));
  assert.throws(()=>previewBoard(base,{type:"turn",actions:[move,move,move]},false,"white"));
  assert.throws(()=>previewBoard(base,{type:"turn",actions:[{type:"move",from:{row:0,col:4},to:{row:2,col:4}}]},false,"white"));
  assert.throws(()=>previewBoard(base,{type:"turn",actions:[white]},false,"white"));
});

test("only the active tournament player can publish validated frames for the current turn",async(t)=>{
  if(!process.env.DATABASE_URL){t.skip("DATABASE_URL is not configured");return;}
  const {pool}=await import("../lib/db.ts");
  const {createGameRecord}=await import("../lib/game-repository.ts");
  const {saveTournamentPreview}=await import("../lib/tournament-preview.ts");
  const {randomUUID}=await import("node:crypto");
  const client=await pool.connect();
  await client.query("BEGIN");
  t.after(async()=>{await client.query("ROLLBACK");client.release();await pool.end();});
  const ids=Array.from({length:3},()=>randomUUID());
  for(const id of ids)await client.query('INSERT INTO "user"(id,username) VALUES($1,$1)',[id]);
  const tournament=(await client.query("INSERT INTO tournaments(name,minutes,created_by) VALUES('Preview test',5,$1) RETURNING id",[ids[0]])).rows[0].id;
  const game=await createGameRecord(client,ids[0],ids[1],"pushfight","X",300,tournament);
  const partial={type:"setup",pieces:[{row:0,col:2,kind:"pusher"}]};
  await assert.rejects(()=>saveTournamentPreview(client,game,ids[2],0,partial));
  await assert.rejects(()=>saveTournamentPreview(client,game,ids[1],0,partial));
  await saveTournamentPreview(client,game,ids[0],0,partial);
  await saveTournamentPreview(client,game,ids[0],0,{type:"setup",pieces:[]});
  assert.equal((await client.query("SELECT count(*)::int n FROM tournament_move_previews WHERE game_id=$1",[game])).rows[0].n,2);
  assert.equal((await client.query("SELECT count(*)::int n FROM moves WHERE game_id=$1",[game])).rows[0].n,0);
  assert.equal((await client.query("SELECT clock_started_at FROM games WHERE id=$1",[game])).rows[0].clock_started_at,null);
  for(const [i,payload]of [white,black].entries())await client.query("INSERT INTO moves(game_id,player_id,move_number,payload) VALUES($1,$2,$3,$4)",[game,ids[i],i+1,JSON.stringify(payload)]);
  await client.query("UPDATE games SET clock_started_at=now() WHERE id=$1",[game]);
  await assert.rejects(()=>saveTournamentPreview(client,game,ids[0],0,partial));
  const before=(await client.query("SELECT clock_started_at,status,winner_id FROM games WHERE id=$1",[game])).rows[0];
  const actions: TurnAction[]=[{type:"move",from:{row:1,col:0},to:{row:2,col:0}}];
  await saveTournamentPreview(client,game,ids[0],2,{type:"turn",actions});
  actions.push({type:"push",index:{row:0,col:3},dir:"right"});
  await saveTournamentPreview(client,game,ids[0],2,{type:"turn",actions});
  const frames=(await client.query("SELECT board,base_move_count FROM tournament_move_previews WHERE game_id=$1 AND base_move_count=2 ORDER BY id",[game])).rows;
  assert.equal(frames.length,2);assert.equal(frames[0].board[2][0],"white-pusher");assert.equal(frames[1].board[0][4],"white-pusher-anchor");
  assert.deepEqual((await client.query("SELECT clock_started_at,status,winner_id FROM games WHERE id=$1",[game])).rows[0],before);
  assert.equal((await client.query("SELECT count(*)::int n FROM moves WHERE game_id=$1",[game])).rows[0].n,2);
  const regular=await createGameRecord(client,ids[0],ids[1],"pushfight","X");
  await assert.rejects(()=>saveTournamentPreview(client,regular,ids[0],0,partial));
  await client.query("UPDATE games SET status='cancelled' WHERE id=$1",[game]);
  await assert.rejects(()=>saveTournamentPreview(client,game,ids[0],2,{type:"turn",actions:[]}));
  await client.query("DELETE FROM tournaments WHERE id=$1",[tournament]);
  assert.equal((await client.query("SELECT 1 FROM tournament_move_previews WHERE game_id=$1",[game])).rowCount,0);
});
