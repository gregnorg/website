# Project instructions

When the user says "Engage", build the completed changes, restart the production
service, commit the changes, and push to `main`. This is authorization for those
actions; do not ask for redundant confirmation. Run appropriate checks before
deployment and report any failures. Keep unrelated edits out of commits and
deployments unless the user includes them in the requested scope.

The production service has passwordless sudo permission for this exact command:
`sudo -n /usr/bin/systemctl restart shoveactually`. Use that command rather than
stop/start commands or a service name with the `.service` suffix.

Commit each completed new feature to `main`, as requested by the user.
