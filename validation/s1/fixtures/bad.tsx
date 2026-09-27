import { Button } from '@/components/ui/button';
export const bad = <div className="bg-red-500 p-[13px] not-a-real-class"><Button className="px-8 bg-primary">错误覆盖</Button><div style={{color:'#123456'}} /></div>;
export function dynamic(color: string) { return <Button className={`bg-${color}`}>动态错误</Button>; }
