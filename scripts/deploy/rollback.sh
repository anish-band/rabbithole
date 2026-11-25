#!/usr/bin/env bash
# Roll the function back to an earlier image (ECR keeps the last 3). Run from the repo root:
#   npm run deploy:rollback            # list the images you can roll back to
#   npm run deploy:rollback -- <tag>   # switch the function to that image, then check health
# The next `npm run deploy` (or CI deploy) moves it forward again.
set -euo pipefail
REGION="${AWS_REGION:-$(aws configure get region)}"
export AWS_REGION="${REGION:-us-east-1}" AWS_DEFAULT_REGION="${REGION:-us-east-1}"

REPO=$(aws cloudformation describe-stacks --stack-name rabbithole-registry --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" --output text)
CURRENT=$(aws lambda get-function --function-name rabbithole --query 'Code.ImageUri' --output text)

if [[ $# -eq 0 ]]; then
  echo "Running: $CURRENT"
  echo "Available (newest first):"
  aws ecr describe-images --repository-name rabbithole --query 'reverse(sort_by(imageDetails,&imagePushedAt))[].[imageTags[0],imagePushedAt]' --output text
  exit 0
fi

echo "==> $CURRENT  ->  $REPO:$1"
aws lambda update-function-code --function-name rabbithole --image-uri "$REPO:$1" >/dev/null
# Poll instead of `aws lambda wait`, which older CLIs lack.
for _ in $(seq 1 60); do
  STATUS=$(aws lambda get-function-configuration --function-name rabbithole --query LastUpdateStatus --output text)
  [[ $STATUS == Successful ]] && break
  [[ $STATUS == Failed ]] && { echo "update failed" >&2; exit 1; }
  sleep 3
done
URL=$(aws cloudformation describe-stacks --stack-name rabbithole --query "Stacks[0].Outputs[?OutputKey=='Url'].OutputValue" --output text)
curl -fsS --max-time 30 "${URL%/}/api/health" && echo && echo "Rolled back to $1."
