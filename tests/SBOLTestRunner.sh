#!/bin/bash

# Clone the necessary repositories
git clone --recurse-submodules https://github.com/mehersam/SBOLTestRunner 
git clone --recurse-submodules https://github.com/mehersam/SynBioHubRunner
mkdir Timing

function cleanup {
    rm -rf SBOLTestRunner SynBioHubRunner Timing
    docker kill synbiohub
    docker rm synbiohub
    docker volume rm sbh_test
}

trap cleanup EXIT

# Start SynBioHub
echo "Starting SBH"
docker run -d -p 7777:7777 --name synbiohub --volume sbh_test:/mnt synbiohub/synbiohub:snapshot

echo "Setting up SynBioHubRunner"
cp tests/Emulator_Settings.txt SynBioHubRunner/src/resources/Emulator_Settings.txt
cd SynBioHubRunner
mvn package

echo "Building TestRunner"
cd ../SBOLTestRunner
mvn package

cd ../

echo "Waiting for SynBioHub to come online..."
while [[ "$(docker logs --tail 1 synbiohub)" != "Resuming 0 job(s)" ]]
do
    sleep 5
done

# Register a user account on SynBioHub
RESULT=300

echo "Creating account..."
while [[ "$RESULT" -ne 302 ]]
do
    RESULT=$(curl -X POST \
                --write-out "%{http_code}" \
                --silent \
                --output /dev/null \
                -F "userName=testuser" \
                -F "userFullName=Test User" \
                -F "userEmail=test@user.synbiohub" \
                -F "userPassword=test" \
                -F "userPasswordConfirm=test" \
                -F "instanceName=Test Synbiohub" \
                -F "instanceURL=http://localhost:7777/" \
                -F "uriPrefix=http://localhost:7777/" \
                -F "color=#D25627" \
                -F "frontPageText=text" \
                -F "virtuosoINI=/etc/virtuoso-opensource-7/virtuoso.ini" \
                -F "virtuosoDB=/var/lib/virtuoso-opensource-7/db" \
                -F "allowPublicSignup=true" \
                http://localhost:7777/setup)
    if [[ "$RESULT" -ne 302 ]]
    then
        echo "not created yet..."
        sleep 10
    fi
done
echo "Created!"
                

echo "Running tests"
java -jar $PWD/SBOLTestRunner/target/SBOLTestRunner-0.0.1-SNAPSHOT-withDependencies.jar "java -jar $PWD/SynBioHubRunner/target/SBHEmulator-0.0.1-SNAPSHOT-withDependencies.jar" "Compared/" "Retrieved/" "-e" "Emulated/"
