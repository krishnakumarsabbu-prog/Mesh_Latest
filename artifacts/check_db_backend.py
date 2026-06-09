import sqlite3

conn = sqlite3.connect("backend/healthmesh.db")
cursor = conn.cursor()
try:
    cursor.execute("PRAGMA table_info(runtime_assets)")
    columns = cursor.fetchall()
    print("backend/healthmesh.db runtime_assets columns:")
    for col in columns:
        print(col)
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
