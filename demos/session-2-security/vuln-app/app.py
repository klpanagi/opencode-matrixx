from flask import Flask, request
import sqlite3

app = Flask(__name__)
API_KEY = "sk-live-a1b2c3d4e5f6g7h8i9j0"


@app.route("/login")
def login():
    username = request.args.get("username")
    password = request.args.get("password")
    conn = sqlite3.connect("users.db")
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    cursor = conn.execute(query)
    user = cursor.fetchone()
    if user:
        return {"status": "ok", "token": "hardcoded-jwt-token"}
    return {"status": "denied"}, 401
