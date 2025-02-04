module.exports = (db, exists) => {
    if (exists) { return }

    // create songs table
    db.prepare(`CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY NOT NULL,
        publish_date TEXT NOT NULL,
        addition_date TEXT NOT NULL,
        song_type INTEGER NOT NULL,
        thumbnail TEXT NOT NULL,
        maxres_thumbnail TEXT NOT NULL,
        thumbnail_type INTEGER NOT NULL,
        average_color TEXT NOT NULL,
        dark_color TEXT NOT NULL,
        light_color TEXT NOT NULL,
        dormant INT DEFAULT 0 NOT NULL,
        last_updated STRING DEFAULT "2023-08-29T00:10:01.629Z" NOT NULL,
        fandom_url TEXT)`).run()

    // create songs artists table
    db.prepare(`CREATE TABLE IF NOT EXISTS songs_artists (
        song_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        artist_category INTEGER NOT NULL,
        PRIMARY KEY (song_id, artist_id, artist_category),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
        FOREIGN KEY (artist_id) REFERENCES artists (id) ON DELETE CASCADE
    )`).run()
    db.prepare(`CREATE INDEX idx_songs_artists_artist_id_song_id
        ON songs_artists (artist_id, song_id);`).run()

    // create songs names table
    db.prepare(`CREATE TABLE IF NOT EXISTS songs_names (
        song_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        name_type INTEGER NOT NULL,
        PRIMARY KEY (song_id, name_type),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE)`).run()

    // create songs video ids table
    db.prepare(`CREATE TABLE IF NOT EXISTS songs_video_ids (
        song_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_type INTEGER NOT NULL,
        PRIMARY KEY (song_id, video_id),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE)`).run()

    // create artists table
    db.prepare(`CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY NOT NULL,
        artist_type INTEGER NOT NULL,
        publish_date TEXT NOT NULL,
        addition_date TEXT NOT NULL,
        base_artist_id INTEGER,
        average_color TEXT NOT NULL,
        dark_color TEXT NOT NULL,
        light_color TEXT NOT NULL,
        FOREIGN KEY (base_artist_id) REFERENCES artists (id) ON DELETE SET NULL)`).run()
    
    // create artists names table
    db.prepare(`CREATE TABLE IF NOT EXISTS artists_names (
        artist_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        name_type INTEGER NOT NULL,
        PRIMARY KEY (artist_id, name_type),
        FOREIGN KEY (artist_id) REFERENCES artists (id) ON DELETE CASCADE)`).run()

    // create artists thumbnails table
    db.prepare(`CREATE TABLE IF NOT EXISTS artists_thumbnails (
        thumbnail_type INTEGER NOT NULL,
        url TEXT NOT NULL,
        artist_id INTEGER NOT NULL,
        PRIMARY KEY (artist_id, thumbnail_type),
        FOREIGN KEY (artist_id) REFERENCES artists (id) ON DELETE CASCADE)`).run()

    // create views totals table
    db.prepare(`CREATE TABLE IF NOT EXISTS views_totals (
        song_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        total INTEGER NOT NULL,
        PRIMARY KEY (song_id, timestamp),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE)`).run()
    db.prepare(`CREATE INDEX idx_views_totals_timestamp_song_id
    ON views_totals (timestamp, song_id);`).run()

    // create views breakdown table
    db.prepare(`CREATE TABLE IF NOT EXISTS views_breakdowns (
        song_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        views INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        view_type INTEGER NOT NULL,
        PRIMARY KEY (song_id, timestamp, video_id),
        FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE)`).run()
    db.prepare(`CREATE INDEX idx_views_breakdowns_timestamp_song_id
    ON views_breakdowns (timestamp, song_id);`).run()

    // create views metadata table
    db.prepare(`CREATE TABLE IF NOT EXISTS views_metadata (
        timestamp TEXT PRIMARY KEY NOT NULL,
        updated TEXT NOT NULL)`).run()
}