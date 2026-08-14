<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { t } from '@/utils/i18n';

const props = withDefaults(defineProps<{ source?: string }>(), {
  source: '',
});

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

function render(source: string): string {
  if (!source) return `<p style="color:var(--color-text-muted)">${t('noContent')}</p>`;
  const raw = md.render(source);
  return DOMPurify.sanitize(raw) as string;
}
</script>

<template>
  <div class="markdown-body" v-html="render(props.source)"></div>
</template>
