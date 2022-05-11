#!/usr/bin/env sh

# switch to more secure file umask before everything else...
umask 0027

# auto write config file containing node_env to let config module automatically pick this up.
# this file is evaluated nearly at the end of all files possible:
# see https://github.com/lorenwest/node-config/wiki/Configuration-Files
# this file only contains the connections to load, nothing else
# to overwrite something else just place additional files beside this one inside config folder (e.g. local.json)
CONFIG_FILE=${HOME}/config/local-${NODE_ENV}.json

# set default instance for node config ("docker") but allow overwriting via docker env vars
NODE_APP_INSTANCE=${NODE_APP_INSTANCE:-docker}

# when running in Kubernetes we need to wait a bit before exiting on SIGTERM
# https://github.com/kubernetes/contrib/issues/1140#issuecomment-290836405
K8S_SIGTERM=${K8S_SIGTERM:-0}

# seconds to wait before sending sigterm to app on exit
# only used if K8S_SIGTERM=1
GRACE_PERIOD=6
NODE=$(command -v node)

# this function checks all arguments given and outputs them. All parameter pairs where key is ending with "password"
# are replaced with string "<set>" instead of real password (e.g. "--redis-password XYZ" => "--redis-password <set>")
safe_print_args() {
    echo "$@" | tr ' ' '\n' | while read -r item; do
        if [ "${item%password}" != "${item}" ]; then
            printf "%s <set> " "$item"
            read -r item;
        else
            printf "%s " "$item"
        fi
    done
}

parse_boolean() {
  # shell true/false values returned here
  if [ "$1" = "1" ] || [ "$1" = "true" ] || [ "$1" = "yes" ] || [ "$1" = "on" ]; then
    return 0
  else
    return 1
  fi
}

writeDefaultConfigBeginning() {
    echo "Creating custom redis-commander config '${CONFIG_FILE}'."

    # =============== generate beginning of redis-commander config =============== #
    cat > "${CONFIG_FILE}" <<EOF
    {
EOF
    # ============= end generate beginning of redis-commander config ============= #
}


writeDefaultConfigEnd() {
    # ================== generate end of redis-commander config ================== #
    cat >> "${CONFIG_FILE}" <<EOF
    }
EOF
    # ================ end generate end of redis-commander config ================ #
}


parseRedisHosts() {
    writeDefaultConfigBeginning

    # split REDIS_HOSTS on comma (,)
    # local:localhost:6379,custom-label:my.hostname
    #   -> local:localhost:6379 custom-label:my.hostname
    redis_hosts_split="$(echo "${REDIS_HOSTS}" | sed "s/,/ /g")"

    # get hosts count
    num_redis_hosts="$(echo "${redis_hosts_split}" | wc -w)"

    echo "Parsing $num_redis_hosts REDIS_HOSTS into custom redis-commander config '${CONFIG_FILE}'."

    if [ "$num_redis_hosts" -gt 0 ]; then
        cat >> "${CONFIG_FILE}" <<EOF
    "connections": [
EOF
    fi

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
        host_split="$(echo "${redis_host}" | sed "s/:/ /g")"

        # get host param count
        num_host_params="$(echo "${host_split}" | wc -w)"

        label=''
        host=''
        port=''
        db_index=''
        password=''

        if [ "${num_host_params}" -eq 1 ]; then
            label=default
            host="$(echo "${host_split}" | cut -d" " -f1)"
        else
            label="$(echo "${host_split}" | cut -d" " -f1)"
            host="$(echo "${host_split}" | cut -d" " -f2)"
        fi

        [ "${num_host_params}" -lt 3 ] \
            && port=6379 \
            || port="$(echo "${host_split}" | cut -d" " -f3)"

        [ "${num_host_params}" -lt 4 ] \
            && db_index=0 \
            || db_index="$(echo "${host_split}" | cut -d" " -f4)"


        [ "${num_host_params}" -lt 5 ] \
            && password='' \
            || password="$(echo "${host_split}" | cut -d" " -f5)"

        [ "${counter}" -eq "${num_redis_hosts}" ] \
            && comma='' \
            || comma=','

        # generate host config
        cat >> "${CONFIG_FILE}" <<EOF
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
    if [ "$num_redis_hosts" -gt 0 ]; then
        cat >> "${CONFIG_FILE}" <<EOF
    ]
EOF
    fi

    writeDefaultConfigEnd
}

# if REDIS_HOSTS is set parse it and create custom config
[ -n "${REDIS_HOSTS}" ] && parseRedisHosts

# Fallback - write default config if not supplied otherwise (already exists or written by
# parsing REDIS_HOSTS env var)
if [ ! -e "${CONFIG_FILE}" ]; then
    writeDefaultConfigBeginning
    writeDefaultConfigEnd
fi

# load HTTP password from a file (e.g. a Docker secret mounted in the container)
HTTP_PASSWORD_FILE=${HTTP_PASSWORD_FILE:-/}
if [ -f "$HTTP_PASSWORD_FILE" ]; then
    echo "setting http auth from file"
    HTTP_PASSWORD=$(cat "$HTTP_PASSWORD_FILE")
    # this env var is evaluated by node-config module, not set as cli param
    # to not show it in process listing / write to docker logs ...
    export HTTP_PASSWORD
fi

# load HTTP password as bcrypt hash from a file (e.g. a Docker secret mounted in the container)
HTTP_PASSWORD_HASH_FILE=${HTTP_PASSWORD_HASH_FILE:-/}
if [ -f "$HTTP_PASSWORD_HASH_FILE" ]; then
    echo "setting hashed http auth from file"
    HTTP_PASSWORD_HASH=$(cat "$HTTP_PASSWORD_HASH_FILE")
    # this env var is evaluated by node-config module, not set as cli param
    # to not show it in process listing / write to docker logs ...
    export HTTP_PASSWORD_HASH
fi

# load REDIS and SENTINEL passwords from a file too
REDIS_PASSWORD_FILE=${REDIS_PASSWORD_FILE:-/}
SENTINEL_PASSWORD_FILE=${SENTINEL_PASSWORD_FILE:-/}

if [ -f "$REDIS_PASSWORD_FILE" ]; then
    REDIS_PASSWORD=$(cat "$REDIS_PASSWORD_FILE")
    # evaluated below and added to cli params
    export REDIS_PASSWORD
fi
if [ -f "$SENTINEL_PASSWORD_FILE" ]; then
    SENTINEL_PASSWORD=$(cat "$SENTINEL_PASSWORD_FILE")
    # evaluated below and added to cli params
    export SENTINEL_PASSWORD
fi

# add other commands as environment variables
# here only env vars related to redis connections are evaluated
# all other env vars are checked by node-config module ...
# for an complete list of all other env vars with their mapping
# see file "config/custom_environment_variables.json"

if [ -n "$REDIS_PORT" ]; then
    set -- "$@" "--redis-port" "$REDIS_PORT"
fi

if [ -n "$REDIS_HOST" ]; then
    set -- "$@" "--redis-host" "$REDIS_HOST"
fi

if [ -n "$REDIS_SOCKET" ]; then
    set -- "$@" "--redis-socket" "$REDIS_SOCKET"
fi

if [ -n "$REDIS_TLS" ] && parse_boolean "$REDIS_TLS"; then
    set -- "$@" "--redis-tls"
fi

if [ -n "$REDIS_USERNAME" ]; then
    set -- "$@" "--redis-username" "$REDIS_USERNAME"
fi

if [ -n "$REDIS_PASSWORD" ]; then
    set -- "$@" "--redis-password" "$REDIS_PASSWORD"
fi

if [ -n "$REDIS_DB" ]; then
    set -- "$@" "--redis-db" "$REDIS_DB"
fi

if [ -n "$REDIS_OPTIONAL" ] && parse_boolean "$REDIS_OPTIONAL"; then
    set -- "$@" "--redis-optional"
fi

if [ -n "$SENTINEL_PORT" ]; then
    set -- "$@" "--sentinel-port" "$SENTINEL_PORT"
fi

if [ -n "$SENTINEL_HOST" ]; then
    set -- "$@" "--sentinel-host" "$SENTINEL_HOST"
fi

if [ -n "$SENTINELS" ]; then
    set -- "$@" "--sentinels" "$SENTINELS"
fi

if [ -n "$SENTINEL_NAME" ]; then
    set -- "$@" "--sentinel-name" "$SENTINEL_NAME"
fi

if [ -n "$SENTINEL_USERNAME" ]; then
    set -- "$@" "--sentinel-username" "$SENTINEL_USERNAME"
fi

if [ -n "$SENTINEL_PASSWORD" ]; then
    set -- "$@" "--sentinel-password" "$SENTINEL_PASSWORD"
fi

if [ -n "$REPLACE_CONFIG_ENV" ]; then
    # special case for more complex docker setup with multiple connections
    # to unix sockets, sentinels and normal redis server not configurable
    # via REDIS_HOSTS...
    # search all config files (except custom-environment-variables.json) and do in place
    # replacement of a string to the value of the env var, e.g.
    # set $REPLACE_CONFIG_ENV=REDIS_PASS_1 and env REDIS_PASS_1=mypass
    # now search config files for string "REDIS_PASS_1" and write there "mypass" instead

    env_vars_replace="$(echo "${REPLACE_CONFIG_ENV}" | sed "s/,/ /g")"
    echo "Going to replace this env vars inside config files: $env_vars_replace"

    for env_var in ${env_vars_replace}; do
        for json_conf in config/*.json; do
            if [ "$json_conf" != "config/custom-environment-variables.json" ]; then
                # need to replace &\/ from content of env_var var as they are special chars in sed
                sed -i 's/"'"$env_var"'"/"'"$(printenv "$env_var" | sed 's/\\/\\\\/g; s/&/\\&/g; s#/#\\/#g;')"'"/g' "$json_conf"
            fi
        done
    done
fi
# all other env vars are evaluated by node-config module ...

# syntax check of all config files to help detecting invalid ones early
for i in config/*.json; do
    if ! jq empty "${i}"; then
        echo "ERROR: config file ${i} has invalid json syntax" >> /dev/stderr
        exit 1
    fi
done

# install trap for SIGTERM to delay end of app a bit for Kubernetes
# otherwise container might get requests after exiting itself
exitTrap() {
    echo "Got signal, wait a bit before exit"
    sleep $GRACE_PERIOD
    kill -TERM "$NODE_PID"
}

if [ "$K8S_SIGTERM" = "1" ]; then
    trap exitTrap TERM INT
    echo "node ./bin/redis-commander $(safe_print_args "$@") for k8s"
    setsid "$NODE" ./bin/redis-commander "$@" &
    NODE_PID=$!
    wait $NODE_PID
    trap - TERM INT
    wait $NODE_PID
else
    echo "node ./bin/redis-commander $(safe_print_args "$@")"
    exec "$NODE" ./bin/redis-commander "$@"
fi

