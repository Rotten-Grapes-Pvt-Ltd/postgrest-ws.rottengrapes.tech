import React, { useEffect, useRef, useState } from 'react';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Circle, Fill, Stroke } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import axios from 'axios';

const MapComponent = ({ user, token }) => {
  const mapRef = useRef();
  const [map, setMap] = useState(null);
  const [vectorSource, setVectorSource] = useState(new VectorSource());
  const [showForm, setShowForm] = useState(false);
  const [clickCoordinate, setClickCoordinate] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: new Style({
        image: new Circle({
          radius: 8,
          fill: new Fill({ color: 'red' }),
          stroke: new Stroke({ color: 'white', width: 2 })
        })
      })
    });

    const mapInstance = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        vectorLayer
      ],
      view: new View({
        center: fromLonLat([-71.0656, 42.3548]), // Boston
        zoom: 12
      })
    });

    mapInstance.on('click', (event) => {
      if (user) {
        const coordinate = toLonLat(event.coordinate);
        setClickCoordinate(coordinate);
        setShowForm(true);
      }
    });

    setMap(mapInstance);
    loadLocations();

    return () => mapInstance.setTarget(undefined);
  }, [user, vectorSource]);

  const loadLocations = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/locations`);
      const features = response.data.map(location => {
        const coords = location.location.coordinates;
        return new Feature({
          geometry: new Point(fromLonLat([coords[0], coords[1]])),
          name: location.name,
          description: location.description
        });
      });
      vectorSource.clear();
      vectorSource.addFeatures(features);
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const handleSave = async () => {
    if (!clickCoordinate || !formData.name) return;

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${process.env.REACT_APP_API_URL}/locations`, {
        name: formData.name,
        description: formData.description,
        geometry: `POINT(${clickCoordinate[0]} ${clickCoordinate[1]})`
      }, { headers });

      setShowForm(false);
      setFormData({ name: '', description: '' });
      loadLocations();
    } catch (error) {
      console.error('Error saving location:', error);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({ name: '', description: '' });
  };

  return (
    <div className="map-container">
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      {showForm && (
        <div className="location-form">
          <h3>Add Location</h3>
          <input
            type="text"
            placeholder="Location Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
          />
          <textarea
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
          <div>
            <button className="save-btn" onClick={handleSave}>Save</button>
            <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      )}
      
      {!user && (
        <div style={{position: 'absolute', top: '10px', left: '10px', background: 'white', padding: '10px', borderRadius: '4px'}}>
          Login to add new locations
        </div>
      )}
    </div>
  );
};

export default MapComponent;