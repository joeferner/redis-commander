{{/*
See https://github.com/bitnami/charts/blob/1f0028bb009582b1bddefd1a84533e4b58fd1d63/bitnami/common/templates/_capabilities.tpl
*/}}

{{/*
Return the target Kubernetes version
*/}}
{{- define "redis-commander.capabilities.kubeVersion" -}}
{{- if .Values.global }}
    {{- if .Values.global.kubeVersion }}
    {{- .Values.global.kubeVersion -}}
    {{- else }}
    {{- default .Capabilities.KubeVersion.Version .Values.kubeVersion -}}
    {{- end -}}
{{- else }}
{{- default .Capabilities.KubeVersion.Version .Values.kubeVersion -}}
{{- end -}}
{{- end -}}

{{/*
Return the appropriate apiVersion for Horizontal Pod Autoscaler.
*/}}
{{- define "redis-commander.capabilities.hpa.apiVersion" -}}
{{- if semverCompare "<1.23-0" (include "redis-commander.capabilities.kubeVersion" .context) -}}
{{- if .beta2 -}}
{{- print "autoscaling/v2beta2" -}}
{{- else -}}
{{- print "autoscaling/v2beta1" -}}
{{- end -}}
{{- else -}}
{{- print "autoscaling/v2" -}}
{{- end -}}
{{- end -}}