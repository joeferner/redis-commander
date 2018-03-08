#!/bin/sh

# if REDIS_HOSTS isn't set just run the script
[ -z "${REDIS_HOSTS}" ] && exec node /src/redis-commander/bin/redis-commander "$@"

echo 'Creating custom redis-commander config.'

# =============== generate beginning of redis-commander config =============== #
cat > ${HOME}/.redis-commander <<EOF
{
  "sidebarWidth":250,
  "locked":false,
  "CLIHeight":50,
  "CLIOpen":false,
  "default_connections": [
EOF
# ============= end generate beginning of redis-commander config ============= #

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
    cat >> ${HOME}/.redis-commander <<EOF
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


# ================== generate end of redis-commander config ================== #
cat >> ${HOME}/.redis-commander <<EOF
  ]
}
EOF
# ================ end generate end of redis-commander config ================ #

echo 'Configuration:'
cat ${HOME}/.redis-commander

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

echo "node /src/redis-commander/bin/redis-commander "$@""
exec node /src/redis-commander/bin/redis-commander $@
