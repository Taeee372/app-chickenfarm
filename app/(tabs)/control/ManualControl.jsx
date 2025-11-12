import Octicons from '@expo/vector-icons/Octicons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TouchableOpacity, View
} from 'react-native';

// 반드시 ledThreshold까지 선언!
const MANUAL_DEFAULT_SETTINGS = {
  doorOpenTemp: 28,
  fanHumidityThreshold: 70,
  fanCO2Threshold: 5000,
  fanCOThreshold: 300,
  fanNH3Threshold: 100,
  fanNO2Threshold: 200,
  ledThreshold: 300
};

const ManualControl = () => {
  const router = useRouter();

  const [settings, setSettings] = useState(MANUAL_DEFAULT_SETTINGS);
  const [controlMode, setControlMode] = useState({
    door: 'auto',
    humfan: 'auto',
    co2fan: 'auto',
    airfan: 'auto',
    led: 'auto'
  });

  const [refreshing, setRefreshing] = useState(false);
  const [sensorData, setSensorData] = useState({
    temperature: '-',
    humidity: '-',
    lux: '-',
    co2: '-',
    co: '-',
    nh3: '-',
    no2: '-'
  });
  const [deviceStates, setDeviceStates] = useState({
    door: false,
    humfan: false,
    co2fan: false,
    airfan: false,
    led: false
  });
  const [isLoading, setIsLoading] = useState({
    door: false,
    humfan: false,
    co2fan: false,
    airfan: false,
    led: false
  });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const activeRequestsRef = useRef(0);

  const loadSettings = async () => {
    try {
      const resp = await axios.get('http://192.168.30.240:5000/api/settings/simple', { timeout: 2000 });
      if (resp.data && resp.data.success && resp.data.data) {
        setSettings(resp.data.data);
      }
    } catch (e) {}
  };

  const getLampColor = (device) => {
    if (!deviceStates[device]) return styles.lampInactive;
    if (controlMode[device] === 'manual') return styles.lampActive;
    return styles.lampDanger;
  };

  const retryRequest = async (fn, maxRetries = 100) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fn();
        return { success: true, data: res };
      } catch (e) {
        if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 100));
      }
    }
    return { success: false };
  };

  const getSensorData = async () => {
    try {
      const result = await retryRequest(() =>
        axios.get('http://192.168.30.240:5000/api/realtime', { timeout: 5000 })
      );
      if (result.success && result.data && result.data.data && result.data.data.data) {
        try {
          const d = result.data.data.data;
          setSensorData({
            temperature: d.temperature,
            humidity: d.humidity,
            lux: d.lux,
            co2: d.co2,
            co: d.co || '-',
            nh3: d.nh3 || '-',
            no2: d.no2 || '-'
          });
          return true;
        } catch (e) { return false; }
      }
      return false;
    } catch (e) { return false; }
  };

  const getControlStatus = async () => {
    try {
      const r = await retryRequest(() =>
        axios.get('http://192.168.30.240:5000/api/status', { timeout: 5000 })
      );
      return !!(r.success && r.data && r.data.data);
    } catch (e) { return false; }
  };

  const loadInitialData = async () => {
    setIsInitialLoading(true);
    setLoadError(false);
    await loadSettings();

    const [sRes, stRes] = await Promise.all([
      retryRequest(() => axios.get('http://192.168.30.240:5000/api/realtime', { timeout: 500 })),
      retryRequest(() => axios.get('http://192.168.30.240:5000/api/status', { timeout: 500 }))
    ]);

    if (sRes.success && stRes.success) {
      setLoadError(false);
    } else {
      setLoadError(true);
    }

    setIsInitialLoading(false);
  };

  const toggleMode = async (device) => {
    if (isLoading[device]) return;
    if (activeRequestsRef.current >= 2) {
      Alert.alert('알림', '잠시만 기다려주세요');
      return;
    }
    const currentMode = controlMode[device];
    const newMode = currentMode === 'auto' ? 'manual' : 'auto';

    setControlMode(prev => ({ ...prev, [device]: newMode }));
    setIsLoading(prev => ({ ...prev, [device]: true }));
    activeRequestsRef.current += 1;

    const retryCount = 3;
    for (let i = 0; i < retryCount; i++) {
      await new Promise(r => setTimeout(r, 100));
      await retryRequest(() =>
        axios.post('http://192.168.30.240:5000/api/control', {
          device: device,
          mode: newMode
        }, { timeout: 5000 })
      );
      if (i === retryCount - 1) await new Promise(r => setTimeout(r, 100));
    }

    await new Promise(r => setTimeout(r, 200));
    await getControlStatus();
    setIsLoading(prev => ({ ...prev, [device]: false }));
    activeRequestsRef.current -= 1;
  };

    const turnOn = async (device) => {
      setDeviceStates(prev => ({ ...prev, [device]: true }));
      verifyDeviceControl(device, true);
    };
    const turnOff = async (device) => {
      setDeviceStates(prev => ({ ...prev, [device]: false }));
      verifyDeviceControl(device, false);
    };

    const verifyDeviceControl = async (device, targetState) => {
      setTimeout(async () => {
        try {
          await axios.post('http://192.168.30.240:5000/api/control', {
            device: device,
            state: targetState
          }, { timeout: 5000 });
        } catch (error) {}
      }, 0);
    };

    const onRefresh = useCallback(async () => {
      setRefreshing(true);
      await getSensorData();
      await getControlStatus();
      setRefreshing(false);
    }, []);

  // 모든 장치(문/팬/조명) 자동제어시 센서값에 따라 즉시 deviceStates 갱신
useEffect(() => {
  // 전체팬(airfan)
  if (controlMode.airfan === 'auto') {
    const hum = Number(sensorData.humidity);
    const co2 = Number(sensorData.co2);
    const co = Number(sensorData.co);
    const nh3 = Number(sensorData.nh3);
    const no2 = Number(sensorData.no2);
    const airfanOn = (
      hum >= settings.fanHumidityThreshold ||
      co2 >= settings.fanCO2Threshold ||
      co >= settings.fanCOThreshold ||
      nh3 >= settings.fanNH3Threshold ||
      no2 >= settings.fanNO2Threshold
    );
    if (deviceStates.airfan !== airfanOn) {
      setDeviceStates(prev => ({ ...prev, airfan: airfanOn }));
      verifyDeviceControl('airfan', airfanOn);
    }
  }
  // 습도팬
  if (controlMode.humfan === 'auto') {
    const hum = Number(sensorData.humidity);
    const humfanOn = hum >= settings.fanHumidityThreshold;
    if (deviceStates.humfan !== humfanOn) {
      setDeviceStates(prev => ({ ...prev, humfan: humfanOn }));
      verifyDeviceControl('humfan', humfanOn);
    }
  }
  // 공기질팬
  if (controlMode.co2fan === 'auto') {
    const co2 = Number(sensorData.co2);
    const co = Number(sensorData.co);
    const nh3 = Number(sensorData.nh3);
    const no2 = Number(sensorData.no2);
    const co2fanOn = (
      co2 >= settings.fanCO2Threshold ||
      co >= settings.fanCOThreshold ||
      nh3 >= settings.fanNH3Threshold ||
      no2 >= settings.fanNO2Threshold
    );
    if (deviceStates.co2fan !== co2fanOn) {
      setDeviceStates(prev => ({ ...prev, co2fan: co2fanOn }));
      verifyDeviceControl('co2fan', co2fanOn);
    }
  }
  // 문(door)
  if (controlMode.door === 'auto') {
    const temp = Number(sensorData.temperature);
    const doorOpen = temp >= settings.doorOpenTemp;
    if (deviceStates.door !== doorOpen) {
      setDeviceStates(prev => ({ ...prev, door: doorOpen }));
      verifyDeviceControl('door', doorOpen);
    }
  }
  // 조명(led)
  if (controlMode.led === 'auto') {
    const lux = Number(sensorData.lux);
    const ledOn = lux < (settings.ledThreshold || 300);
    if (deviceStates.led !== ledOn) {
      setDeviceStates(prev => ({ ...prev, led: ledOn }));
      verifyDeviceControl('led', ledOn);
    }
  }
  // eslint-disable-next-line
}, [
  controlMode.airfan, controlMode.humfan, controlMode.co2fan, controlMode.door, controlMode.led,
  sensorData.humidity, sensorData.co2, sensorData.co, sensorData.nh3, sensorData.no2, sensorData.temperature, sensorData.lux,
  settings.fanHumidityThreshold, settings.fanCO2Threshold, settings.fanCOThreshold, settings.fanNH3Threshold, settings.fanNO2Threshold,
  settings.doorOpenTemp, settings.ledThreshold
]);

  useEffect(() => {
    loadInitialData();
    const interval = setInterval(() => { getSensorData(); getControlStatus(); }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync("loginInfo")
    router.replace("/authorization/signin")
  };

  if (isInitialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>데이터를 불러오는 중...</Text>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Octicons name="alert-fill" size={40} color="#ffc219ff" />
        <Text style={styles.errorTitle}>동기화가 되지 않았습니다.</Text>
        <Text style={styles.errorText}>일시적 데이터 동기화 실패입니다. 다시 시도해 주세요.</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={loadInitialData}
        >
          <Text style={styles.retryButtonText}>다시 시도하기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.pageHeader}> 
        <Text style={styles.headerTitle}>수동 제어</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.container}
      >

        {/* 이하 기존 카드 구조 동일하게 그대로 복사 사용 */}

        {/* 문 제어 */}
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.labelContainer}>
              <Text style={styles.label}>문 제어</Text>
              <View style={[styles.statusLamp, getLampColor('door')]} />
            </View>
            <Text style={styles.value}>{sensorData.temperature}°C</Text>
          </View>
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>모드</Text>
            <View style={styles.modeSwitch}>
              <Text style={[styles.modeText, controlMode.door === 'manual' && styles.activeText]}>수동</Text>
              <Switch
                trackColor={{false: '#ff9800', true: '#4CAF50'}}
                thumbColor='#fff'
                value={controlMode.door === 'auto'}
                onValueChange={() => toggleMode('door')}
              />
              <Text style={[styles.modeText, controlMode.door === 'auto' && styles.activeText]}>자동</Text>
            </View>
          </View>
          {controlMode.door === 'manual' && (
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>문 제어</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.onButton} onPress={() => turnOn('door')}>
                  <Text style={styles.buttonText}>열기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.offButton} onPress={() => turnOff('door')}>
                  <Text style={styles.buttonText}>닫기</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 습도팬 */}
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.labelContainer}>
              <Text style={styles.label}>습도팬</Text>
              <View style={[styles.statusLamp, getLampColor('humfan')]} />
            </View>
            <Text style={styles.value}>{sensorData.humidity}%</Text>
          </View>
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>모드</Text>
            <View style={styles.modeSwitch}>
              <Text style={[styles.modeText, controlMode.humfan === 'manual' && styles.activeText]}>수동</Text>
              <Switch
                trackColor={{false: '#ff9800', true: '#4CAF50'}}
                thumbColor='#fff'
                value={controlMode.humfan === 'auto'}
                onValueChange={() => toggleMode('humfan')}
              />
              <Text style={[styles.modeText, controlMode.humfan === 'auto' && styles.activeText]}>자동</Text>
            </View>
          </View>
          {controlMode.humfan === 'manual' && (
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>팬 가동</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.onButton} onPress={() => turnOn('humfan')}>
                  <Text style={styles.buttonText}>ON</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.offButton} onPress={() => turnOff('humfan')}>
                  <Text style={styles.buttonText}>OFF</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 공기질팬 */}
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.labelContainer}>
              <Text style={styles.label}>공기질팬</Text>
              <View style={[styles.statusLamp, getLampColor('co2fan')]} />
            </View>
            <View style={styles.sensorValuesContainer}>
              <Text style={styles.sensorValueSmall}>CO₂: {sensorData.co2} ppm</Text>
              <Text style={styles.sensorValueSmall}>CO: {sensorData.co} ppm</Text>
              <Text style={styles.sensorValueSmall}>NH₃: {sensorData.nh3} ppm</Text>
              <Text style={styles.sensorValueSmall}>NO₂: {sensorData.no2} ppm</Text>
            </View>
          </View>
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>모드</Text>
            <View style={styles.modeSwitch}>
              <Text style={[styles.modeText, controlMode.co2fan === 'manual' && styles.activeText]}>수동</Text>
              <Switch
                trackColor={{false: '#ff9800', true: '#4CAF50'}}
                thumbColor='#fff'
                value={controlMode.co2fan === 'auto'}
                onValueChange={() => toggleMode('co2fan')}
              />
              <Text style={[styles.modeText, controlMode.co2fan === 'auto' && styles.activeText]}>자동</Text>
            </View>
          </View>
          {controlMode.co2fan === 'manual' && (
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>팬 가동</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.onButton} onPress={() => turnOn('co2fan')}>
                  <Text style={styles.buttonText}>ON</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.offButton} onPress={() => turnOff('co2fan')}>
                  <Text style={styles.buttonText}>OFF</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 전체 팬 제어 */}
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.labelContainer}>
              <Text style={styles.label}>전체 팬 제어</Text>
              <View style={[styles.statusLamp, getLampColor('airfan')]} />
            </View>
            <Text style={styles.value}>전체 팬 센서</Text>
          </View>
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>모드</Text>
            <View style={styles.modeSwitch}>
              <Text style={[styles.modeText, controlMode.airfan === 'manual' && styles.activeText]}>OFF</Text>
              <Switch
                trackColor={{false: '#ff9800', true: '#4CAF50'}}
                thumbColor='#fff'
                value={controlMode.airfan === 'auto'}
                onValueChange={() => toggleMode('airfan')}
              />
              <Text style={[styles.modeText, controlMode.airfan === 'auto' && styles.activeText]}>ON</Text>
            </View>
          </View>
          <Text style={styles.description}>
            {controlMode.airfan === 'auto'
              ? '센서 값이 나쁘면 자동으로 모든 팬 가동'
              : '자동으로 제어하지 않습니다.'}
          </Text>
        </View>

        {/* 조도 */}
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.labelContainer}>
              <Text style={styles.label}>조도</Text>
              <View style={[styles.statusLamp, getLampColor('led')]} />
            </View>
            <Text style={styles.value}>{sensorData.lux} lux</Text>
          </View>
          <View style={styles.modeRow}>
            <Text style={styles.modeLabel}>모드</Text>
            <View style={styles.modeSwitch}>
              <Text style={[styles.modeText, controlMode.led === 'manual' && styles.activeText]}>수동</Text>
              <Switch
                trackColor={{false: '#ff9800', true: '#4CAF50'}}
                thumbColor='#fff'
                value={controlMode.led === 'auto'}
                onValueChange={() => toggleMode('led')}
              />
              <Text style={[styles.modeText, controlMode.led === 'auto' && styles.activeText]}>자동</Text>
            </View>
          </View>
          {controlMode.led === 'manual' && (
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>조명</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity style={styles.onButton} onPress={() => turnOn('led')}>
                  <Text style={styles.buttonText}>ON</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.offButton} onPress={() => turnOff('led')}>
                  <Text style={styles.buttonText}>OFF</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/control/AutoControl')}
        >
          <Text>자동 제어 설정</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default ManualControl;



const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pageHeader: { 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  logoutText: {
    color: '#007AFF',
    fontSize: 16,
  },
  container: {
    backgroundColor: '#fff',
    padding: 15
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 40
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 32
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center'
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 20,
    marginBottom: 15
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333'
  },
  statusLamp: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5
  },
  lampActive: {
    backgroundColor: '#4CAF50'
  },
  lampDanger: {
    backgroundColor: '#f44336'
  },
  lampInactive: {
    backgroundColor: '#9e9e9e'
  },
  value: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e6df5'
  },
  sensorValuesContainer: {
    alignItems: 'flex-end',
    gap: 2
  },
  sensorValueSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e6df5',
    lineHeight: 16
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  modeLabel: {
    fontSize: 16,
    color: '#666'
  },
  modeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  modeText: {
    fontSize: 14,
    color: '#999'
  },
  activeText: {
    color: '#333',
    fontWeight: '600'
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0'
  },
  controlLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500'
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10
  },
  onButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center'
  },
  offButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  settingsButton: {
    backgroundColor: '#dddddd',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 70,
    alignItems: 'center'
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginTop: 10,
    lineHeight: 18
  }
});
