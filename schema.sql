-- Table cleanup
DROP TABLE IF EXISTS wrs;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS trials;

-- Players
CREATE TABLE players (
  uuid TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  date_joined TEXT NOT NULL
);

-- Trials (name is now the primary key)
CREATE TABLE trials (
  name TEXT PRIMARY KEY
);

INSERT OR IGNORE INTO trials (name) VALUES
  ('Crystal'),
  ('Genesis'),
  ('Glass'),
  ('Riser'),
  ('Solar'),
  ('Vestibule'),
  ('Celsius'),
  ('Circulation'),
  ('Flow'),
  ('Martyr'),
  ('Neon Bold'),
  ('Sawdust'),
  ('Ascension'),
  ('Faith'),
  ('Gale'),
  ('Grip'),
  ('Thread'),
  ('Umbrel'),
  ('Depot'),
  ('Flame'),
  ('Ironsing'),
  ('Monoxide'),
  ('Rust Belt'),
  ('Wisp');

-- Submissions
DROP TABLE IF EXISTS submissions;
CREATE TABLE submissions (
  uuid TEXT PRIMARY KEY,

  player_uuid TEXT NOT NULL,
  trial_name TEXT NOT NULL,

  player_name TEXT NOT NULL,

  time REAL NOT NULL,
  date TEXT NOT NULL,

  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('approved', 'denied', 'pending')),

  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);

-- WRs
DROP TABLE IF EXISTS wrs;
CREATE TABLE wrs (
  trial_name TEXT PRIMARY KEY,
  submission_uuid TEXT NOT NULL,

  player_uuid TEXT NOT NULL,
  player_name TEXT NOT NULL,

  time REAL NOT NULL,
  date TEXT NOT NULL,

  FOREIGN KEY (submission_uuid) REFERENCES submissions(uuid),
  FOREIGN KEY (player_uuid) REFERENCES players(uuid),
  FOREIGN KEY (trial_name) REFERENCES trials(name)
);