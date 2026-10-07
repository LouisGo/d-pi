import { Button } from '../../../src/modules/ui/renderer/public';
import styles from './sample.module.css';
import { clsx } from 'clsx';
import { cva } from 'class-variance-authority';
const variants = cva('text-primary', { variants: { active: { true: 'bg-muted' } } });
export const good = <div className={clsx('flex gap-4 text-primary', variants({active:true}))}><div className={styles.sample} /><Button className="w-full">保存</Button><div className="p-[var(--panel-padding)]" /></div>;
