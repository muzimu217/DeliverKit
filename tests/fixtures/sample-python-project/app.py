"""Sample Python project for ForgeKit E2E testing.

一个最小但真实的 Flask 应用，包含入口、依赖和 Dockerfile。
用于验证 ForgeKit 的完整闭环：inspect → plan → build。
"""

from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello():
    return {"status": "ok", "message": "Hello from ForgeKit sample project"}


@app.route("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
