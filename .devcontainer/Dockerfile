FROM mcr.microsoft.com/devcontainers/javascript-node:22

RUN apt-get install -y lsb-release curl gpg
RUN <<EOF
    curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
    chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
    "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/redis.list
    apt-get update
EOF
RUN apt-get install -y redis
