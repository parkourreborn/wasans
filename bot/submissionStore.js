const submissionToThread = new Map();

export function getThreadIdBySubmissionId(submissionId) {
    return submissionToThread.get(submissionId);
}

export function setSubmissionThread(submissionId, threadId) {
    submissionToThread.set(submissionId, threadId);
}

export function deleteSubmissionThread(submissionId) {
    submissionToThread.delete(submissionId);
}
