export Version=0.0.1
# cd ../src/auth-token-issuer
# npm ci
# npm run dist
# cd ../..
# mkdir -p dist
# cp src/auth-token-issuer/dist/auth-token-issuer-$Version.zip dist/
SRC_DIR=src
DIST_DIR=dist

# Create the dist directory if it doesn't exist
mkdir -p $DIST_DIR

# Loop through each module in the src directory
for module in $SRC_DIR/*; do
  if [ -d "$module" ]; then
    cd $module
    npm ci
    npm run dist
    cd -
    # Copy the resulting files to the dist directory
    cp $module/dist/*-$Version.zip $DIST_DIR/
    cp $module/dist/*-$Version.sha256 $DIST_DIR/
    # Remove the $module/dist/ directory
    rm -rf $module/dist/
  fi
done