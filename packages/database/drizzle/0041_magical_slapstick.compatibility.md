# ST-058 asynchronous project-asset validation

This additive migration records an asset validation state/code and associates a
completed image-upload session with its idempotent validation job. Pending rows
have no dimensions or thumbnail key until the pipeline worker completes safely;
only active rows are exposed through the project asset list.
