#!/bin/bash

ffmpeg -y -loglevel repeat+info -protocol_whitelist "file,crypto,data,http,https,tcp,tls" -i $1 -bsf:a aac_adtstoasc -movflags +faststart -c copy "file:$2"
