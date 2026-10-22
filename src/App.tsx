import { useRoute } from './lib/router';
import Dashboard from './pages/Dashboard';
import HelpPage from './pages/HelpPage';
import EditorPage from './pages/EditorPage';
import PreviewPage from './pages/PreviewPage';

export default function App() {
  const route = useRoute();
  if (route.name === 'help') return <HelpPage />;
  if (route.name === 'edit') return <EditorPage key={route.id} id={route.id} />;
  if (route.name === 'preview') return <PreviewPage key={route.id + route.screen} id={route.id} screenId={route.screen} />;
  return <Dashboard />;
}
