import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import axios from 'axios'

const API_URL = 'https://api.juejin.cn/recommend_api/v1/short_msg/hot'
const BACKUP_DIR = path.join(process.env.GITHUB_WORKSPACE, 'backup')
let cursor = '0' // 初始游标，从0开始

async function fetchHotPosts() {
  try {
    const response = await axios.post(API_URL, {
      cursor,
      id_type: 4,
      limit: 20,
      sort_type: 200,
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://juejin.cn/',
      },
    })
    // 更新游标
    cursor = response.data.cursor
    return response.data.data || []
  } catch (error) {
    console.error('抓取失败:', error.message)
    return []
  }
}

async function fetchPostComments(postId) {
  try {
    const response = await axios.post('https://api.juejin.cn/interact_api/v1/comment/list', {
      cursor: '0',
      client_type: 2608,
      item_id: postId,
      item_type: 4,
      limit: 40,
      sort: 1,
    })
    return response.data.data || []
  } catch (error) {
    console.error('抓取评论失败:', error.message)
    return []
  }
}

function formatComments(comments) {
  return comments.map(comment => ({
    username: comment.user_info.user_name,
    content: comment.comment_info.comment_content,
    ctime: comment.ctime,
    reply: comment.reply_infos.map(reply => ({
      username: reply.user_info.user_name,
      content: reply.reply_info.reply_content,
      ctime: reply.ctime,
    })),
  }))
}

async function formatData(posts) {
  const content = []

  for (const post of posts) {
    const item = post.msg_Info
    const username = post.author_user_info.user_name
    const comments = await fetchPostComments(item.msg_id)
    content.push({
      username,
      content: item.content,
      picture: item.pic_list,
      ctime: item.ctime,
      url: `https://juejin.cn/pin/${item.msg_id}`,
      comments: formatComments(comments),
    })
  }

  return content
}

function jsonToMarkdown(posts) {
  let md = ''

  const formatTime = (timestamp) => {
    return new Date(Number.parseInt(timestamp) * 1000).toLocaleString()
  }

  const buildReplies = (replies, depth = 1) => {
    return replies.map(reply =>
      `${'  '.repeat(depth)}- **${reply.username}**：${reply.content}`,
    ).join('\n')
  }

  posts.forEach((post) => {
    // 主帖子内容
    md += `## @${post.username}\n\n`
    md += `${post.content}\n\n`
    md += `**发布时间**：${formatTime(post.ctime)}\n\n`
    md += `[原帖链接](${post.url})\n\n`

    // 处理图片
    if (post.picture && post.picture.length > 0) {
      md += `${post.picture.map(img => `<img src="${img}" style="max-width: 300px;max-height: 300px;"/>`).join('\n\n')}\n\n`
    }

    // 处理评论
    if (post.comments && post.comments.length > 0) {
      md += '### 评论\n\n'
      post.comments.forEach((comment) => {
        md += `- **@${comment.username}**：${comment.content}\n`
        if (comment.reply && comment.reply.length > 0) {
          md += `${buildReplies(comment.reply)}\n`
        }
      })
      md += '\n'
    }

    md += '---\n\n'
  })

  return md
}

async function main() {
  try {
    // 创建备份目录
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR)
    }

    // 获取并保存数据
    const posts1 = await fetchHotPosts()
    const posts2 = await fetchHotPosts()
    const posts = posts1.concat(posts2)
    if (posts.length === 0) {
      console.log('未获取到数据')
      return
    }

    const content = await formatData(posts)
    const date = new Date().toISOString().split('T')[0]
    // 保存为 JSON 文件
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${date}.json`),
      JSON.stringify(content, null, 2),
    )
    // 转换为 Markdown 并保存
    // const markdownContent = jsonToMarkdown(content)
    // fs.writeFileSync(
    //   path.join(BACKUP_DIR, `${date}.md`),
    //   markdownContent,
    // )
    console.log(`备份成功`)
  } catch (error) {
    console.error('备份失败:', error)
    process.exit(1)
  } finally {
    cursor = '0' // 重置游标
    console.log('::set-output name=has_changes::true') // 通知 Action 有变更
  }
}

main().catch(error => {
  console.error('::error::', error)
  process.exit(1)
})
