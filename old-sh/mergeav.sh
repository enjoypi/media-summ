#!/bin/bash

ffmpeg -y -loglevel repeat+info -i "file:$1" -i "file:$2" -c copy -map 0:a:0 -map 1:v:0 -movflags +faststart "file:$3"
