import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import axios from 'axios'
import * as cheerio from 'cheerio'
import dayjs from 'dayjs'

const API_URL = 'http://www.wufazhuce.com'
const BACKUP_DIR = path.join(process.env.GITHUB_WORKSPACE || './', 'backup')
const BACKUP_PATH = path.join(BACKUP_DIR, 'one.json')

// 解析HTML数据
function parseData(data) {
  const $ = cheerio.load(data)

  return $('.carousel-inner .item').toArray().map((el) => {
    const $el = $(el)
    const title = $el.find('.fp-one-cita a').text().trim()
    const url = $el.find('.fp-one-cita a').attr('href')

    if (!title || !url) return null

    const picUrl = $el.find('.fp-one-imagen')
    const day = $el.find('.dom').text().trim()
    const month = $el.find('.may').text().trim()
    const dateString = `${day} ${month}`
    
    return {
      title,
      url,
      // pic: picUrl.attr('src'),
      date: dayjs(dateString, 'DD MMM YYYY').format('YYYY-MM-DD'),
    }
  }).filter(Boolean)
}

// 合并去重数据
function mergeData(existing, newItems) {
  const existingUrls = new Set(existing.map(item => item.url))
  const uniqueNew = newItems.filter(item => !existingUrls.has(item.url))
  return [...existing, ...uniqueNew].sort((a, b) => a.date.localeCompare(b.date))
}

async function main() {
  try {
    // 创建备份目录
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR)
    }

    const response = await axios.get(API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://cn.bing.com/',
      },
    })

    const items = parseData(response.data)
    // 读取本地数据
    const backupData = fs.existsSync(BACKUP_PATH) ? JSON.parse(fs.readFileSync(BACKUP_PATH)) : []
    // 本地数据合并去重
    const mergedItems = mergeData(backupData, items)
    // 备份数据
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(mergedItems, null, 2))

    console.log(`备份成功`)
  } catch (error) {
    console.error('备份失败:', error)
    process.exit(1)
  }
}

main()
