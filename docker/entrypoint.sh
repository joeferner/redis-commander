#!/usr/bin/env sh

CONFIG_FILE=${HOME}/.redis-commander

# when running in kubernetes we need to wait a bit before exiting on SIGTERM
# https://github.com/kubernetes/contrib/issues/1140#issuecomment-290836405
K8S_SIGTERM=${K8S_SIGTERM:-0}

# seconds to wait befor sending sigterm to app on exit
# only used if K8S_SIGTERM=1
GRACE_PERIOD=6



writeDefaultConfigBeginning() {
    echo 'Creating custom redis-commander config.'

    # =============== generate beginning of redis-commander config =============== #
    cat > ${CONFIG_FILE} <<EOF
    {
    "sidebarWidth":250,
    "locked":false,
    "CLIHeight":50,
    "CLIOpen":false,
    "default_connections": [
EOF
    # ============= end generate beginning of redis-commander config ============= #
}


writeDefaultConfigEnd() {
    # ================== generate end of redis-commander config ================== #
    cat >> ${CONFIG_FILE} <<EOF
        ]
    }
EOF
    # ================ end generate end of redis-commander config ================ #
}


parseRedisHosts() {
    writeDefaultConfigBeginning

    # split REDIS_HOSTS on comma (,)
    # local:localhost:6379,custom-label:my.hostname
    #   -> local:localhost:6379 custom-label:my.hostname
    redis_hosts_split="$(echo ${REDIS_HOSTS} | sed "s/,/ /g")"

    # get hosts count
    num_redis_hosts="$(echo ${redis_hosts_split} | wc -w)"

    # =================== loop on redis hosts and generate config ================ #
    # redis_host form should be
    #   hostname
    #     or
    #   label:hostname
    #     or
    #   label:hostname:port
    #     or
    #   label:hostname:port:dbIndex
    #     or
    #   label:hostname:port:dbIndex:password
    counter=0
    for redis_host in ${redis_hosts_split}; do
        counter=$((counter + 1))

        # split redis_host on colon (:)
        # local:localhost:6379
        #   -> local localhost 6379
        host_split="$(echo ${redis_host} | sed "s/:/ /g")"

        # get host param count
        num_host_params="$(echo "${host_split}" | wc -w)"

        label=''
        host=''
        port=''
        db_index=''
        password=''

        if [ "${num_host_params}" -eq 1 ]; then
            label=default
            host="$(echo ${host_split} | cut -d" " -f1)"
        else
            label="$(echo ${host_split} | cut -d" " -f1)"
            host="$(echo ${host_split} | cut -d" " -f2)"
        fi

        [ "${num_host_params}" -lt 3 ] \
            && port=6379 \
            || port="$(echo ${host_split} | cut -d" " -f3)"

        [ "${num_host_params}" -lt 4 ] \
            && db_index=0 \
            || db_index="$(echo ${host_split} | cut -d" " -f4)"


        [ "${num_host_params}" -lt 5 ] \
            && password='' \
            || password="$(echo ${host_split} | cut -d" " -f5)"

        [ "${counter}" -eq "${num_redis_hosts}" ] \
            && comma='' \
            || comma=','

        # generate host config
        cat >> ${CONFIG_FILE} <<EOF
        {
            "label":"${label}",
            "host":"${host}",
            "port":"${port}",
            "password":"${password}",
            "dbIndex":${db_index}
        }${comma}
EOF

    done
    # ================ end loop on redis hosts and generate config =============== #

    writeDefaultConfigEnd
}

# if REDIS_HOSTS is set parse it and create custom config
[[ ! -z "${REDIS_HOSTS}" ]] && parseRedisHosts

# Fallback - write default config if not supplied otherwise (already exists or written by
# parsing REDIS_HOSTS env var)
if [[ ! -e ${CONFIG_FILE} ]]; then
    writeDefaultConfigBeginning
    writeDefaultConfigEnd
fi

echo 'Configuration:'
cat ${CONFIG_FILE}

# load HTTP password from a file (e.g. a Docker secret mounted in the container)
HTTP_PASSWORD_FILE=${HTTP_PASSWORD_FILE:-/}

if [ -f $HTTP_PASSWORD_FILE ]; then
    HTTP_PASSWORD=$(cat $HTTP_PASSWORD_FILE)
    export HTTP_PASSWORD="$HTTP_PASSWORD"
fi

# add other commands as environment variables
if [[ ! -z "$REDIS_PORT" ]]; then
    set -- "$@" "--redis-port $REDIS_PORT"
fi

if [[ ! -z "$REDIS_HOST" ]]; then
    set -- "$@" "--redis-host $REDIS_HOST"
fi

if [[ ! -z "$REDIS_SOCKET" ]]; then
    set -- "$@" "--redis-socket $REDIS_SOCKET"
fi

if [[ ! -z "$REDIS_PASSWORD" ]]; then
    set -- "$@" "--redis-password $REDIS_PASSWORD"
fi

if [[ ! -z "$REDIS_DB" ]]; then
    set -- "$@" "--redis-db $REDIS_DB"
fi

if [[ ! -z "$SENTINEL_PORT" ]]; then
    set -- "$@" "--sentinel-port $SENTINEL_PORT"
fi

if [[ ! -z "$SENTINEL_HOST" ]]; then
    set -- "$@" "--sentinel-host $SENTINEL_HOST"
fi

if [[ ! -z "$HTTP_USER" ]]; then
    set -- "$@" "--http-u $HTTP_USER"
fi

if [[ ! -z "$HTTP_PASSWORD" ]]; then
    set -- "$@" "--http-p $HTTP_PASSWORD"
fi

if [[ ! -z "$HTTP_PASSWORD_HASH" ]]; then
    set -- "$@" "--http-h $HTTP_PASSWORD_HASH"
fi

if [[ ! -z "$PORT" ]]; then
    set -- "$@" "--port $PORT"
fi

if [[ ! -z "$ADDRESS" ]]; then
    set -- "$@" "--address $ADDRESS"
fi

if [[ ! -z "$ROOT_PATTERN" ]]; then
    set -- "$@" "--root-pattern $ROOT_PATTERN"
fi

if [[ ! -z "$URL_PREFIX" ]]; then
    set -- "$@" "--url-prefix $URL_PREFIX"
fi

if [[ ! -z "$NO_LOG_DATA" ]]; then
    set -- "$@" "--no-log-data"
fi

if [[ ! -z "$FOLDING_CHAR" ]]; then
    set -- "$@" "--folding-char $FOLDING_CHAR"
fi

if [[ ! -z "$USE_SCAN" ]]; then
    set -- "$@" "--use-scan"
fi

# install trap for SIGTERM to delay end of app a bit for kubernetes
# otherwise container might get requests after exiting itself
exitTrap() {
    echo "Got signal, wait a bit before exit"
    sleep $GRACE_PERIOD
    kill -TERM $NODE_PID
}

if [ "$K8S_SIGTERM" = "1" ]; then
    trap exitTrap TERM INT
    echo "node ./bin/redis-commander "$@" for k8s"
    setsid /usr/local/bin/node ./bin/redis-commander $@ &
    NODE_PID=$!
    wait $NODE_PID
    trap - TERM INT
    wait $NODE_PID
else
    echo "node ./bin/redis-commander "$@""
    exec /usr/local/bin/node ./bin/redis-commander $@
fi

