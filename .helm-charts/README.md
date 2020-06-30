# Helm Charts

# redis-commander

**Install**

```sh
helm repo add tn-redis-commander https://raw.githubusercontent.com/kubernetes-tn/redis-commander/master/.helm-charts/

helm -n myspace install redis-web-ui tn-redis-commander/redis-commander

```

**Main values** 

- `redisHost`: Sepecifies redis host if it is a single host

- `redisPassword` : Sepecifies redis password

- `redisHosts`: Specifies multiple redis endpoints in format <label:host:port>,...

- `env` : extra env vars for the main container redis-commander in array structure ([{name: ... , value: ...}, {name: ... , value: ...}]).

- `ingress.enabled` : Enable Ingress for the service

**Other Values**

Check the rest of values in [values.yaml](redis-commander/values.yaml)

**Example**

```sh
# add repo
helm repo add tn-redis-commander https://raw.githubusercontent.com/kubernetes-tn/redis-commander/master/.helm-charts/

# custom values
cat > myvalues.yaml <<EOF
redisHost: redis-master
# env:
# - name: MESSAGE
#   value: Hello
ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx
  hosts:
    - host: redis-ui.example.com
      paths: ["/"]
EOF

# install helm chart with the custom values
helm install \
  redis-web-ui \
  tn-redis-commander/redis-commander \
  -f myvalues.yaml

```