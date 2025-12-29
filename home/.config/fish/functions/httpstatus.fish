function httpstatus -d "Display HTTP status code information"
  # HTTP status code database
  set -l codes_1xx "100:Continue" "101:Switching Protocols" "102:Processing" "103:Early Hints"
  set -l codes_2xx "200:OK" "201:Created" "202:Accepted" "203:Non-Authoritative Information" "204:No Content" "205:Reset Content" "206:Partial Content" "207:Multi-Status" "208:Already Reported" "226:IM Used"
  set -l codes_3xx "300:Multiple Choices" "301:Moved Permanently" "302:Found" "303:See Other" "304:Not Modified" "305:Use Proxy" "307:Temporary Redirect" "308:Permanent Redirect"
  set -l codes_4xx "400:Bad Request" "401:Unauthorized" "402:Payment Required" "403:Forbidden" "404:Not Found" "405:Method Not Allowed" "406:Not Acceptable" "407:Proxy Authentication Required" "408:Request Timeout" "409:Conflict" "410:Gone" "411:Length Required" "412:Precondition Failed" "413:Payload Too Large" "414:URI Too Long" "415:Unsupported Media Type" "416:Range Not Satisfactory" "417:Expectation Failed" "418:I'm a teapot" "421:Misdirected Request" "422:Unprocessable Entity" "423:Locked" "424:Failed Dependency" "425:Too Early" "426:Upgrade Required" "428:Precondition Required" "429:Too Many Requests" "431:Request Header Fields Too Large" "451:Unavailable For Legal Reasons"
  set -l codes_5xx "500:Internal Server Error" "501:Not Implemented" "502:Bad Gateway" "503:Service Unavailable" "504:Gateway Timeout" "505:HTTP Version Not Supported" "506:Variant Also Negotiates" "507:Insufficient Storage" "508:Loop Detected" "510:Not Extended" "511:Network Authentication Required"

  if test (count $argv) -lt 1
    echo "Usage: httpstatus <code|pattern>"
    echo "Examples:"
    echo "  httpstatus 404       # Show specific code"
    echo "  httpstatus 2*        # Show all 2xx codes"
    echo "  httpstatus 40*       # Show all 40x codes"
    echo "  httpstatus 200-299   # Show range of codes"
    return 1
  end

  set -l query $argv[1]

  # Handle wildcard patterns
  if string match -qr '\*$' $query
    set -l prefix (string replace '*' '' $query)
    set -l found 0
    
    for category in codes_1xx codes_2xx codes_3xx codes_4xx codes_5xx
      for entry in $$category
        set -l code (string split ':' $entry)[1]
        if string match -q "$prefix*" $code
          echo "$code: "(string split ':' $entry)[2]
          set found 1
        end
      end
    end
    
    if test $found -eq 0
      echo "No status codes found matching: $query"
      return 1
    end
    return 0
  end

  # Handle range patterns (e.g., 200-299)
  if string match -qr '^[0-9]+-[0-9]+$' $query
    set -l range_parts (string split '-' $query)
    set -l start $range_parts[1]
    set -l end $range_parts[2]
    set -l found 0
    
    for category in codes_1xx codes_2xx codes_3xx codes_4xx codes_5xx
      for entry in $$category
        set -l code (string split ':' $entry)[1]
        if test $code -ge $start -a $code -le $end
          echo "$code: "(string split ':' $entry)[2]
          set found 1
        end
      end
    end
    
    if test $found -eq 0
      echo "No status codes found in range: $query"
      return 1
    end
    return 0
  end

  # Handle specific code
  set -l found 0
  for category in codes_1xx codes_2xx codes_3xx codes_4xx codes_5xx
    for entry in $$category
      set -l code (string split ':' $entry)[1]
      if test $code = $query
        echo "$code: "(string split ':' $entry)[2]
        set found 1
        break
      end
    end
    if test $found -eq 1
      break
    end
  end

  if test $found -eq 0
    echo "Unknown HTTP status code: $query"
    return 1
  end
end
