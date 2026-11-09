## 证书

### client

#### 私钥：



#### 公钥：



### server

#### 私钥



#### 公钥



## TLCP数据

### 工作模式



### client 随机数（32字节）



### Server随机数（32字节）



### 预主密钥（pre_master_secret）



### 主密钥（master_secret）

```text
master_secret= PRF(pre_master_secret,"master secret", ClientHello.random +ServerHello.random)[0.. 47]
```



### 工作密钥

``` text
key_block= PRF(master_secret,"key expansion",  server_random + client_random);

client_write_MAC_secret[SecurityParameters. hash_size]    32字节	     （GCM模式则跳过第一个部分就是client_write_key）

server_write_MAC_secret[SecurityParameters. hash_size]   32字节        （GCM模式则跳过第一个部分就是client_write_key）

client_write_key[SecurityParameters. key_material_length]  16字节

server_write_key[SecurityParameters. key_material_length]  16字节

client_write_IV[SecurityParameters. fixed_iv_length]  4字节		      （CBC模式用不到）

server_write_IV[SecurityParameters. fixed_iv_length] 4字节              （CBC模式用不到）
```

#### client_write_MAC_secret（32字节）



#### server_write_MAC_secret（32字节）



#### client_write_key（16字节）



#### server_write_key（16字节）



#### client_write_IV（4字节）



#### server_write_IV（4字节）



### 加密数据包

### CBC-MODE

#### client_0

> 握手Encrypted handshake Message
>
> 密文结构：IV（16位数）+密文
>
> 明文内容： Finished消息+MAC值（32字节）+（填充长度）+（填充值）
>
> ​       示例 ：14 00（20）是标识这是finished消息的意思 + 明文长度（两字节）+明文 +MAC值（32字节）+（填充长度）+（填充值）
>
> 校验码的计算是在加密之前进行,运算方法如下:
>
> HMAC_hash(MAC_write_secret,seq_num+TLSCompressed.type+TLSCompressed. version+TLSCompressed.length+TLSCompressed.fragment)
>
> 注意在这里计算完整性的时候 是对整个 finished消息进行的 （这里是特殊的因为加密的内容就是Finished消息 所以看起来他是有结构的 但其实他一整个就是被加密的原文数据 是一个整体）
>
> 也就是说
>
> TLSCompressed.length长度指的是 （标识符（14 00） + 明文长度 +明文）的长度
>
> TLSCompressed.fragment指的是  标识符（14 00）+ 明文长度 +明文





#### client_1

> 第一个Application Data
>
> 密文结构：IV（16位数）+密文
>
> 明文内容： 明文+MAC值（32字节）+（填充长度）+（填充值）



### GCM-MODE

#### client_0

>  握手Encrypted handshake Message
>
>  密文结构：请求序列号（明文8位）+密文+16位MAC
>
>  明文内容：明文
>
>  IV=nonce=fixed_iv+请求序列号
>
>  CTR0=IV+00 00 00 01
>
>  CTR1=IV+00 00 00 02
>
>  认证数据ADD=SEQ_NUM（8字节）+TLS.type+TLS.version+数据数据长度(2字节)
>
>  GHASH 杂凑密钥H SM4_ECB(client_write_key,'16字节个0')
>
>  



#### client_1

> 第一个Application Data
>
> 