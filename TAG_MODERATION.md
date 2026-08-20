# 用户标签审核

查看待审核建议：

```bash
npx wrangler d1 execute chengdu-bar-guide --remote --command "SELECT id,bar_name,suggested_tags,note,created_at FROM bar_tag_suggestions WHERE status='pending' ORDER BY created_at;"
```

通过建议（将 `123` 换成记录 ID）：

```bash
npx wrangler d1 execute chengdu-bar-guide --remote --command "UPDATE bar_tag_suggestions SET status='accepted',reviewed_at=CURRENT_TIMESTAMP WHERE id=123;"
```

拒绝建议：

```bash
npx wrangler d1 execute chengdu-bar-guide --remote --command "UPDATE bar_tag_suggestions SET status='rejected',reviewed_at=CURRENT_TIMESTAMP WHERE id=123;"
```

审核通过后，网页会从 `/api/tag-suggestions` 自动读取并优先展示标签，无需重新部署。
