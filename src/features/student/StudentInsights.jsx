import ForecastCard from './ForecastCard.jsx';
import WeeklyStory from './WeeklyStory.jsx';
import RoadPulse from './RoadPulse.jsx';

export default function StudentInsights({ routeId, serviceDate }) {
  return <section className="card student-insights" aria-labelledby="student-insights-title">
    <h2 id="student-insights-title">رؤى الطالب</h2>
    <ForecastCard routeId={routeId} targetDate={serviceDate}/>
    <WeeklyStory routeId={routeId}/>
    <RoadPulse serviceDate={serviceDate}/>
  </section>;
}
