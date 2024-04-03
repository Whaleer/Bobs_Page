+++
title = 'Test'

date = 2024-04-02T23:24:45+08:00

draft = true

+++

```c
#include <stdio.h>


int main(int argc, char *argv[]) {

    char *argsbuf[128];
    char **args = argsbuf;

    for (int i = 1; i < argc; i++) {
        *args = argv[i];
        args++;
    }

    // 打印最终的参数列表
    for (char **arg = argsbuf; *arg != NULL; arg++) {
        printf("%s\n", *arg);
    }

    return 0;
}

```

