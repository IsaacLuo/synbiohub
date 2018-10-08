#!/bin/bash
docker build -t synbiohub/synbiohub:snapshot -f docker/Dockerfile .;
docker build -t synbiohub/synbiohub:snapshot-standalone -f docker/Dockerfile-standalone .;
