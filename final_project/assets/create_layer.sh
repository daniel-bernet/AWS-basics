#!/bin/bash
mkdir -p layer_dependencies/nodejs
cd layer_dependencies/nodejs

npm init -y
npm install axios mongodb

cd ../..

zip -r layer_dependencies.zip layer_dependencies
