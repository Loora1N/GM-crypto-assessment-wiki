# 可见别加密&消息鉴别码

## 长度扩展攻击

> [!NOTE]
>
> 长度拓展攻击可分为两大类：
>
> - MD结构哈希的长度扩展
> - CBC-MAC的扩展伪造攻击
>
> 而MD结构哈希的长度扩展可以进一步细分为：
>
> - 裸哈希的长度扩展
> - Secret-Prefix MAC长度扩展

### 裸哈希的长度扩展

若哈希算法采用MD结构，例如：

- MD5
- SHA1
- SHA-256
- SM3
- ...

若攻击者已知：

$$
h = H(M)
$$

就可以计算：

$$
h′\ =\ H(\ M\ ∥\ pad(M)\ ∥\ X)
$$

因此构造的新消息是：

```
user=alice || glue_padding || &admin=true
```

> [!NOTE]
>
> 这里的 `glue_padding` 是原消息按照 SHA-256 规则产生的填充。

**攻击结果：**

$$
H(M')=h'
$$

单独针对普通哈希，这通常只是哈希结构的性质，不一定构成安全漏洞。

### Secret-Prefix MAC长度扩展

同样是针对MD结构，但是更加实际的攻击场景

## 条件

系统错误地使用：

$$
MAC_k(M)\ =\ H(K\ ||\ M)
$$

其中：

- $K$ 是秘密密钥
- $M$ 是消息
- 攻击者知道 $M$ 和对应的 MAC
- 攻击者不知道 $K$，但可以猜测其长度

## 例子

服务端使用：

$$
T=\operatorname{SM3}(K\parallel M)
$$

原消息为：

```
M = amount=100&to=alice
```

合法标签为：

```
T = SM3(K || "amount=100&to=alice")
```

攻击者希望追加：

```
X = &admin=true
```

攻击者猜测密钥长度为 16 字节，生成：

$$
P=\operatorname{pad}(K\parallel M)
$$

然后构造：

```
M' =
amount=100&to=alice
|| P
|| &admin=true
```

再把已知标签 $T$ 解释为 SM3 的内部链接状态，从该状态继续处理 `&admin=true`，得到：

$$
T'=
H(K\parallel M\parallel P\parallel X)
$$

攻击者提交：

```
消息：M'
标签：T'
```

服务端计算：

$$
H(K\parallel M')
$$

也就是：

$$
H(K\parallel M\parallel P\parallel X)
$$

结果与攻击者计算的 $T'$ 相同，因此认证通过。

## 攻击结果

攻击者由：

$$
(M,T)
$$

伪造出：

$$
(M',T')
$$

其中：

$$
M'\neq M,\qquad T'\neq T
$$

关键在于：

> 攻击者伪造了扩展消息对应的新标签，而不是制造相同标签。