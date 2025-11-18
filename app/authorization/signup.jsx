import axios from 'axios'
import { router } from 'expo-router'
import { useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button from '../../components/Button'
import Input from '../../components/Input'

const signup = () => {
  const [signupInfo, setSignupInfo] = useState({
    memId: "",
    memPw: "",
    memPwConfirm: "",
    name: "",
  })

  const signupBtn = async () => {
    if (signupInfo.memPw !== signupInfo.memPwConfirm) {
      alert('비밀번호가 일치하지 않습니다.')
      return
    }

    try {
      const response = await axios.post("http://192.168.30.111:8080/api/member/signup", {
        memId: signupInfo.memId,
        memPw: signupInfo.memPw,
        name: signupInfo.name,
      })

      alert('회원가입이 완료되었습니다!')
      router.back()
    } catch (error) {
      console.error('회원가입 실패:', error)
      alert('회원가입에 실패했습니다.')
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.header}>
              <Text style={styles.title}>회원가입</Text>
              <Text style={styles.subtitle}>새 계정을 만들어보세요</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>아이디</Text>
                <Input
                  placeholder="아이디를 입력하세요"
                  onChangeText={(id) => setSignupInfo({ ...signupInfo, memId: id })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>이름</Text>
                <Input
                  placeholder="이름을 입력하세요"
                  onChangeText={(name) => setSignupInfo({ ...signupInfo, name: name })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>비밀번호</Text>
                <Input
                  placeholder="비밀번호를 입력하세요"
                  secureTextEntry
                  onChangeText={(pw) => setSignupInfo({ ...signupInfo, memPw: pw })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>비밀번호 확인</Text>
                <Input
                  placeholder="비밀번호를 다시 입력하세요"
                  secureTextEntry
                  onChangeText={(pw) => setSignupInfo({ ...signupInfo, memPwConfirm: pw })}
                />
              </View>

              <Button
                title='회원가입'
                onPress={signupBtn}
                variant='success'
              />

              <View style={styles.footer}>
                <Text style={styles.footerText}>이미 계정이 있으신가요?</Text>
                <TouchableOpacity onPress={() => router.back()}>
                  <Text style={styles.linkText}> 로그인</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export default signup

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 20,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  signupButton: {
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },
  footerText: {
    color: '#6b7280',
    fontSize: 14,
  },
  linkText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
})
