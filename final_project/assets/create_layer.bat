@echo off
mkdir layer_dependencies\nodejs
cd layer_dependencies\nodejs
call npm init -y
call npm install axios mongodb
cd ../..
powershell Compress-Archive -Path layer_dependencies\* -DestinationPath layer_dependencies.zip -Force
