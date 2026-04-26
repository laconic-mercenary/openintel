import { useEffect, useRef, useState } from "react";
import { encryptText, decryptText } from "../utils/crypto";
import { getComments, addComment } from "../utils/api";
import "./CommentsDialog.css";

export default function CommentsDialog({ intelPoint, cryptoKey, onClose }) {

    // Consts

    const maxCommentLen = 300;
    const maxComments = 10;
    const authorDisplayLen = 8;

    // State

    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // References

    const onCloseRef = useRef(onClose);

    // Effects

    useEffect(() => {
        loadComments();
    }, []);

    // Methods

    const loadComments = async () => {
        setLoading(true);
        setError(null);
        try {
            const raw = await getComments(intelPoint);
            const decrypted = await Promise.all(raw.map(async (item) => {
                try {
                    const plaintext = await decryptText(cryptoKey, item.encryptedText);
                    return {
                        rowKey: item.rowKey,
                        authorHash: item.authorHash,
                        text: plaintext,
                        createdAt: item.createdAt,
                    };
                } catch {
                    return null;
                }
            }));
            const valid = decrypted.filter(Boolean);
            valid.sort((a, b) => b.createdAt - a.createdAt);
            setComments(valid);
        } catch (loadErr) {
            console.error("failed to load comments:", loadErr);
            setError("Failed to load comments — please try again.");
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const encryptedText = await encryptText(cryptoKey, text.trim());
            const { rowKey, authorHash, createdAt } = await addComment(intelPoint, encryptedText);
            setComments((prev) => [{
                rowKey,
                authorHash,
                text: text.trim(),
                createdAt,
            }, ...prev]);
            setText('');
        } catch (submitErr) {
            console.error("failed to add comment:", submitErr);
            if (submitErr.message === 'comment_limit_reached') {
                setError(`Comment limit of ${maxComments} reached.`);
            } else {
                setError("Failed to submit comment — please try again.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (createdAt) => {
        if (!createdAt) return '';
        const d = new Date(createdAt);
        return isNaN(d.getTime()) ? '' : d.toLocaleString();
    };

    const formatAuthor = (authorHash) => {
        if (!authorHash) return 'new comment';
        return authorHash.slice(0, authorDisplayLen);
    };

    // DOM

    return (
        <div className="comments-overlay" onClick={() => onCloseRef.current?.()}>
            <div className="comments-dialog" onClick={(e) => e.stopPropagation()}>
                <button className="comments-close" type="button" onClick={() => onCloseRef.current?.()}>✕</button>
                <h3 className="comments-title">Comments</h3>

                <div className="comments-list">
                    { loading && <p className="comments-empty">Loading...</p> }
                    { !loading && comments.length === 0 && (
                        <p className="comments-empty">No comments yet.</p>
                    )}
                    { comments.map((comment) => (
                        <div key={comment.rowKey} className="comment-item">
                            <div className="comment-header">
                                <span className="comment-author">{formatAuthor(comment.authorHash)}</span>
                                <span className="comment-date">{formatDate(comment.createdAt)}</span>
                            </div>
                            <p className="comment-text">{comment.text}</p>
                        </div>
                    ))}
                </div>

                { error && <p className="comments-error">{error}</p> }

                <form className="comments-form" onSubmit={onSubmit}>
                    <textarea
                        className="comments-input"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Add a comment…"
                        maxLength={maxCommentLen}
                        rows={3}
                        disabled={submitting}
                    />
                    <div className="comments-form-footer">
                        <span className="comments-char-count">{text.length}/{maxCommentLen}</span>
                        <button
                            type="submit"
                            className="comments-submit"
                            disabled={submitting || !text.trim()}>
                            {submitting ? 'Submitting…' : 'Submit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
