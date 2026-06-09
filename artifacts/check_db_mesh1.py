import sqlite3

conn = sqlite3.connect("D:/Git_Repository/Mesh1/backend/healthmesh.db")
cursor = conn.cursor()
try:
    cursor.execute("PRAGMA table_info(runtime_assets)")
    columns = cursor.fetchall()
    print("D:/Git_Repository/Mesh1/backend/healthmesh.db columns:")
    for col in columns:
        print(col)
except Exception as e:
    print("Error:", e)
finally:
    conn.close()
