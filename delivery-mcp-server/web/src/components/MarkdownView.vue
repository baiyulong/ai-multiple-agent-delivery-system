<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const props = withDefaults(defineProps<{ source?: string }>(), {
  source: '',
});

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

function render(source: string): string {
  if (!source) return '<p style="color:var(--color-text-muted)">暂无内容</p>';
  const raw = md.render(source);
  return DOMPurify.sanitize(raw) as string;
}
</script>

<template>
  <div class="markdown-body" v-html="render(props.source)"></div>
</template>
