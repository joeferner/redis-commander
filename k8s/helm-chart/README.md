# Basic Helm Chart for Redis-Commander

For a description see file [README.md](redis-commander/README.md) inside the chart directory.

## Helm chart documentations

The README files are auto-generated with helm-docs [1] from the gotmpl file and the documentation
of each possible value within the values.yml.
The most easy way to update Helm-chart documentation is to call the script used by the GitHub action 
to validate the documentation: `.github/helmdocs.sh`. This script downloads helm-docs and run it against
the chart directory updating helm documentation files as needed.

## Helm chart values.yml schema validation

To validate the data provided to the helm chart within the `values.yml` file a JSON schema file is provided.
Helm v3 automatically uses this file to check the input for invalid or missing values. This file must be
updated manually if new values are added to the helm chart.

More information about this file and how write it can be found on the Helm docs [2]. A good introduction
write-up can be found in the following blog post from Austin Dewey [3]

[1] https://github.com/norwoodj/helm-docs
[2] https://helm.sh/docs/topics/charts/#schema-files
[3] https://austindewey.com/2020/06/13/helm-tricks-input-validation-with-values-schema-json/
