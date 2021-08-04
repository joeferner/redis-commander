#!/bin/bash
set -euo pipefail

# original looks only for changed Chart.yaml file, we want to find all chart dirs
#CHART_DIRS="$(git diff --find-renames --name-only "$(git rev-parse --abbrev-ref HEAD)" remotes/origin/master | grep '[cC]hart.yaml' | sed -e 's#/[Cc]hart.yaml##g')"
CHART_DIRS="$(find $(git rev-parse --show-toplevel) -name "[cC]hart.yaml" | sed -e 's#/[Cc]hart.yaml##g' )"
KUBEVAL_VERSION="0.16.1"
# original schema repo from "instrumenta" not maintained anymore, use the one from "yannh" instead
KUBERNETES_SCHEMA="https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/"

# install kubeval
curl --silent --show-error --fail --location --output /tmp/kubeval.tar.gz https://github.com/instrumenta/kubeval/releases/download/v"${KUBEVAL_VERSION}"/kubeval-linux-amd64.tar.gz
tar -xf /tmp/kubeval.tar.gz kubeval

# validate charts
for CHART_DIR in ${CHART_DIRS}; do
  helm template "${CHART_DIR}" | ./kubeval --strict --ignore-missing-schemas --kubernetes-version "${KUBERNETES_VERSION#v}" --schema-location "${KUBERNETES_SCHEMA}"
done
