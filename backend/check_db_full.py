import sqlite3, json

db = 'backend/healthmesh.db'
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print('=== ALL TABLES ===')
for t in tables:
    name = t[0]
    count = cur.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
    print(f'  {name}: {count} rows')

print()
print('=== runtime_data_centers ===')
for r in cur.execute("SELECT * FROM runtime_data_centers").fetchall():
    print(dict(r))

print()
print('=== runtime_assets: distinct data_source counts ===')
for r in cur.execute("SELECT data_source, environment, COUNT(*) as cnt FROM runtime_assets GROUP BY data_source, environment ORDER BY cnt DESC").fetchall():
    print(dict(r))

print()
print('=== runtime_assets: distinct data_center_short ===')
for r in cur.execute("SELECT DISTINCT data_center_short, COUNT(*) as cnt FROM runtime_assets GROUP BY data_center_short").fetchall():
    print(dict(r))

print()
print('=== runtime_assets: distinct app_ids in metadata ===')
for r in cur.execute("SELECT DISTINCT json_extract(metadata_json, '$.application_id') as app_id, COUNT(*) as cnt FROM runtime_assets GROUP BY app_id ORDER BY cnt DESC").fetchall():
    print(dict(r))

print()
print('=== data_source_imports ===')
for r in cur.execute("SELECT source_name, file_name, record_count, status, imported_at FROM data_source_imports ORDER BY imported_at DESC LIMIT 20").fetchall():
    print(dict(r))

conn.close()
