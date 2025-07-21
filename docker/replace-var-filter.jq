def check_value:
.|with_entries(.value = if (.value|type) == "array" then .=(.value|map(.|check_value))
  elif (.value|type) == "object" then .=(.value|check_value)
  elif .value == $var_name then .=$new_value
  else .=.value end);

.|check_value
