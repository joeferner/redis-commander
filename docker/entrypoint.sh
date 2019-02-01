#!/usr/bin/env sh

# autowrite config file containing node_env to let config module automatically pick this up.
# this file is evaluated nearly at the end of all files possible:
# see https://github.com/lorenwest/node-config/wiki/Configuration-Files
# this file only contains the connections to load, nothing else
# to overwrite something else just place additional files beside this one inside config folder (e.g. local.json)
CONFIG_FILE=${HOME}/config/local-${NODE_ENV}.json

# set default instance for node config ("docker") but allow overwriting via docker env vars
NODE_APP_INSTANCE=${NODE_APP_INSTANCE:-docker}

# when running in kubernetes we need to wait a bit before exiting on SIGTERM
# https://github.com/kubernetes/contrib/issues/1140#issuecomment-290836405
K8S_SIGTERM=${K8S_SIGTERM:-0}

# seconds to wait befor sending sigterm to app on exit
# only used if K8S_SIGTERM=1
GRACE_PERIOD=6



writeDefaultConfigBeginning() {
    echo "Creating custom redis-commander config '${CONFIG_FILE}'."

    # =============== generate beginning of redis-commander config =============== #
    cat > ${CONFIG_FILE} <<EOF
    {
    "connections": [
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

# load HTTP password from a file (e.g. a Docker secret mounted in the container)
HTTP_PASSWORD_FILE=${HTTP_PASSWORD_FILE:-/}

if [ -f $HTTP_PASSWORD_FILE ]; then
    HTTP_PASSWORD=$(cat $HTTP_PASSWORD_FILE)
    # this env var is evaluated by node-config module, not set as cli param
    # to not show it in process listing / write to docker logs ...
    export HTTP_PASSWORD="$HTTP_PASSWORD"
fi

# add other commands as environment variables
# here only env vars related to redis connections are evaluated
# all other env vars are checked by node-config module ...
# for an complete list of all other env vars with their mapping
# see file "config/custom_environment_variables.json"

if [[ ! -z "$REDIS_PORT" ]]; then
    set -- "$@" "--redis-port $REDIS_PORT"
fi

if [[ ! -z "$REDIS_HOST" ]]; then
    set -- "$@" "--redis-host $REDIS_HOST"
fi

if [[ ! -z "$REDIS_SOCKET" ]]; then
    set -- "$@" "--redis-socket $REDIS_SOCKET"
fi

if [[ ! -z "$REDIS_TLS" ]]; then
    if [[ "$REDIS_TLS" = "1" || "$REDIS_TLS" = "true" || "$REDIS_TLS" = "yes" || "$REDIS_TLS" = "on" ]]; then
        set -- "$@" "--redis-tls"
    fi
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
# all other env vars are evaluated by node-config module ...


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

