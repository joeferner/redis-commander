# Helm Charts

# redis-commander

**Install**


Install using this repo after local git checkout itself with setting redis server host value
to `redis`

```sh
cd <git-repo>
helm -n myspace install redis-web-ui ./k8s/helm-chart/redis-commander --set redis.host=redis 
```


**Main values** 

- `redis.host`: Specifies redis host if it is a single host

- `redis.password` : Specifies redis password

- `redis.hosts`: Specifies multiple redis endpoints in format <label:host:port>,...

- `httpAuth.username` : Specifies username for http basic authentication

- `httpAuth.password` : Specifies password for http basic authentication

- `env` : extra env vars for the main container redis-commander in array structure ([{name: ... , value: ...}, {name: ... , value: ...}]).

- `ingress.enabled` : Enable Ingress for the service

**Other Values**

Check the rest of values in [values.yaml](redis-commander/values.yaml)

**Example**

```sh
# add repo
helm repo add redis-commander https://raw.githubusercontent.com/joeferner/redis-commander/master/k8s/helm-chart/

# custom values
cat > myvalues.yaml <<EOF
redis.host: redis-master
# env:
# - name: FOLDING_CHAR
#   value: "/"
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
  redis-commander/redis-commander \
  -f myvalues.yaml

```