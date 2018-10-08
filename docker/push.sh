#!/bin/bash 

if [ "$TRAVIS_BRANCH" == "master" ]; then
    docker login -u "$DOCKER_USERNAME" -p "$DOCKER_PASSWORD";
    docker push synbiohub/synbiohub:snapshot;
    docker push synbiohub/synbiohub:snapshot-standalone;
 fi
